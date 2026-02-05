// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Errors} from "../errors/Errors.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/**
 * @title AgentPool
 * @notice ERC-4626 vault that funds a single AI agent via constrained, pull-based allowance.
 *
 * Constructor choice:
 * This contract is deployed per-agent (by a factory later). A normal constructor is simplest and
 * less error-prone than upgradeable initialization for this use case.
 *
 * How exchange rate works:
 * - Shares represent proportional ownership of the vault's assets.
 * - convertToShares(assets) and convertToAssets(shares) follow ERC-4626.
 * - Share price increases when assets increase without minting new shares (e.g., yield), or
 *   when shares are burned/redeemed while assets remain, raising assets per share.
 *
 * How vesting works:
 * - Each user has a weighted-average unlockTime for newly minted shares.
 * - Before unlockTime, withdrawals/redeems are blocked.
 *
 * How agent pull daily cap works:
 * - A per-day cap limits assets the agent can pull. The day index is block.timestamp / 1 days.
 * - spentToday resets when the day index changes.
 * - pull() transfers assets to an allowed target, not necessarily the agent itself.
 */
contract AgentPool is ERC4626, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct VestingInfo {
        uint128 lockedShares;
        uint64 unlockTime;
    }

    event AgentPulled(uint64 indexed dayIndex, address indexed to, uint256 assets, uint256 spentToday, uint256 cap);
    event DailyCapUpdated(uint256 oldCap, uint256 newCap);
    event AgentRevoked(bool revoked);
    event VestingParamsUpdated(uint64 vestingDuration);
    event AllowedPullTargetUpdated(address indexed target, bool allowed);
    event AgentMetadataUpdated(string metadataURI);

    IIdentityRegistry public immutable identityRegistry;
    uint256 public immutable agentId;
    address public scoreOracle;
    address public admin;
    bool public agentRevoked;
    string public metadataURI;

    uint256 public dailyCap;
    uint64 public currentDay;
    uint256 public spentToday;

    bool public allowlistEnabled;
    mapping(address => bool) public allowedPullTarget;

    uint64 public vestingDuration;
    mapping(address => VestingInfo) private _vesting;

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address owner_,
        address admin_,
        IIdentityRegistry identityRegistry_,
        uint256 agentId_,
        address scoreOracle_,
        uint256 dailyCap_,
        uint64 vestingDuration_,
        string memory metadataURI_
    ) ERC4626(asset_) ERC20(name_, symbol_) Ownable(owner_) {
        if (address(asset_) == address(0)) revert Errors.BadAsset();
        if (owner_ == address(0)) revert Errors.BadOwner();
        if (admin_ == address(0)) revert Errors.BadOwner();
        if (address(identityRegistry_) == address(0)) revert Errors.BadIdentity();
        if (scoreOracle_ == address(0)) revert Errors.BadTarget();

        identityRegistry = identityRegistry_;
        agentId = agentId_;
        scoreOracle = scoreOracle_;
        admin = admin_;
        dailyCap = dailyCap_;
        vestingDuration = vestingDuration_;
        metadataURI = metadataURI_;
        emit AgentMetadataUpdated(metadataURI_);
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEW
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the day index for a timestamp.
    function getDayIndex(uint256 timestamp) public pure returns (uint64) {
        return uint64(timestamp / 1 days);
    }

    /// @notice Remaining cap for the current day.
    function remainingCapToday() external view returns (uint256) {
        uint64 dayIndex = getDayIndex(block.timestamp);
        if (dayIndex != currentDay) return dailyCap;
        if (spentToday >= dailyCap) return 0;
        return dailyCap - spentToday;
    }

    /// @notice Returns the user's current unlock time.
    function getUserUnlockTime(address user) external view returns (uint64) {
        return _vesting[user].unlockTime;
    }

    /// @notice Returns true if the user is currently locked.
    function isUserLocked(address user) public view returns (bool) {
        VestingInfo memory v = _vesting[user];
        return v.lockedShares > 0 && block.timestamp < v.unlockTime;
    }

    /// @inheritdoc ERC4626
    function previewRedeem(uint256 shares) public view override returns (uint256) {
        if (shares == 0) return 0;
        if (isUserLocked(msg.sender)) return 0;
        return super.previewRedeem(shares);
    }

    /// @inheritdoc ERC4626
    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        if (assets == 0) return 0;
        if (isUserLocked(msg.sender)) return type(uint256).max;
        return super.previewWithdraw(assets);
    }

    /// @inheritdoc ERC4626
    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 balance = balanceOf(owner);
        if (balance == 0) return 0;
        if (!isUserLocked(owner)) return super.maxWithdraw(owner);
        return 0;
    }

    /// @inheritdoc ERC4626
    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 balance = balanceOf(owner);
        if (balance == 0) return 0;
        if (!isUserLocked(owner)) return super.maxRedeem(owner);
        return 0;
    }

    /*//////////////////////////////////////////////////////////////
                               ADMIN
    //////////////////////////////////////////////////////////////*/

    modifier onlyOwnerOrAdmin() {
        if (msg.sender != owner() && msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyOwnerOrAdminOrOracle() {
        if (msg.sender != owner() && msg.sender != admin && msg.sender != scoreOracle) revert Errors.NotAuthorized();
        _;
    }

    function setAdmin(address newAdmin) external onlyOwner {
        if (newAdmin == address(0)) revert Errors.BadOwner();
        admin = newAdmin;
    }

    /// @notice Update the score oracle allowed to set caps.
    function setScoreOracle(address newOracle) external onlyOwnerOrAdmin {
        if (newOracle == address(0)) revert Errors.BadTarget();
        scoreOracle = newOracle;
    }

    /// @notice Update the daily pull cap.
    function setDailyCap(uint256 newCap) external onlyOwnerOrAdminOrOracle {
        uint256 old = dailyCap;
        dailyCap = newCap;
        emit DailyCapUpdated(old, newCap);
    }

    /// @notice Enable/disable a pull target.
    function setAllowedPullTarget(address target, bool allowed) external onlyOwnerOrAdmin {
        if (target == address(0)) revert Errors.BadTarget();
        allowedPullTarget[target] = allowed;
        emit AllowedPullTargetUpdated(target, allowed);
    }

    /// @notice Enable or disable allowlist enforcement.
    function setAllowlistEnabled(bool enabled) external onlyOwnerOrAdmin {
        allowlistEnabled = enabled;
    }

    /// @notice Revoke agent pull privileges.
    function revokeAgent() external onlyOwnerOrAdmin {
        agentRevoked = true;
        emit AgentRevoked(true);
    }

    /// @notice Restore agent pull privileges.
    function unrevokeAgent() external onlyOwnerOrAdmin {
        agentRevoked = false;
        emit AgentRevoked(false);
    }

    /// @notice Update vesting parameters.
    function setVestingParams(uint64 vestingDuration_) external onlyOwnerOrAdmin {
        vestingDuration = vestingDuration_;
        emit VestingParamsUpdated(vestingDuration_);
    }

    /// @notice Pause deposits, mints, and pulls. Withdrawals/redeems remain available.
    function pause() external onlyOwnerOrAdmin {
        _pause();
    }

    /// @notice Unpause deposits, mints, and pulls.
    function unpause() external onlyOwnerOrAdmin {
        _unpause();
    }

    /// @notice Rescue non-asset tokens sent to the vault.
    /// @dev Underlying asset rescue is only allowed when paused, to avoid rug-like behavior.
    function rescueTokens(address token, address to, uint256 amount) external onlyOwnerOrAdmin {
        if (to == address(0)) revert Errors.BadTo();
        if (token == address(asset())) {
            if (!paused()) revert Errors.AssetRescueRequiresPause();
        }
        IERC20(token).safeTransfer(to, amount);
    }

    /*//////////////////////////////////////////////////////////////
                             AGENT PULL
    //////////////////////////////////////////////////////////////*/

    modifier whenAgentActive() {
        if (agentRevoked) revert Errors.AgentRevokedError();
        _;
    }

    /// @notice Pull assets from the vault, constrained by daily cap and allowlist.
    function pull(address to, uint256 assets) external nonReentrant whenAgentActive {
        address wallet = identityRegistry.getAgentWallet(agentId);
        if (wallet == address(0)) {
            if (!paused()) _pause();
            revert Errors.BadWallet();
        }
        _requireNotPaused();
        if (msg.sender != wallet) revert Errors.NotAgent();
        if (to == address(0)) revert Errors.BadTo();
        if (allowlistEnabled) {
            if (!allowedPullTarget[to]) revert Errors.TargetNotAllowed();
        }

        uint64 dayIndex = getDayIndex(block.timestamp);
        if (dayIndex != currentDay) {
            currentDay = dayIndex;
            spentToday = 0;
        }

        if (spentToday + assets > dailyCap) revert Errors.CapExceeded();
        spentToday += assets;

        IERC20(asset()).safeTransfer(to, assets);
        emit AgentPulled(dayIndex, to, assets, spentToday, dailyCap);
    }

    /*//////////////////////////////////////////////////////////////
                         ERC4626 OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ERC4626
    function deposit(uint256 assets, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        uint256 shares = super.deposit(assets, receiver);
        _onDeposit(receiver, shares);
        return shares;
    }

    /// @inheritdoc ERC4626
    function mint(uint256 shares, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        uint256 assets = super.mint(shares, receiver);
        _onDeposit(receiver, shares);
        return assets;
    }

    /// @inheritdoc ERC4626
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256 shares)
    {
        if (receiver == address(0)) revert Errors.BadReceiver();
        _beforeWithdraw(owner, assets);
        shares = _convertToShares(assets, Math.Rounding.Ceil);
        _withdraw(msg.sender, receiver, owner, assets, shares);
        _afterWithdraw(owner, shares);
    }

    /// @inheritdoc ERC4626
    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256 assets)
    {
        if (receiver == address(0)) revert Errors.BadReceiver();
        _beforeRedeem(owner, shares);
        assets = previewRedeem(shares);
        _withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL LOGIC
    //////////////////////////////////////////////////////////////*/

    function _onDeposit(address receiver, uint256 shares) internal {
        if (vestingDuration == 0 || shares == 0) return;

        VestingInfo storage v = _vesting[receiver];
        uint256 nowTs = block.timestamp;

        if (nowTs >= v.unlockTime) {
            v.lockedShares = 0;
        }

        uint256 prevLocked = uint256(v.lockedShares);
        uint256 newLocked = prevLocked + shares;
        uint256 newUnlock = nowTs + vestingDuration;

        if (prevLocked == 0) {
            v.unlockTime = uint64(newUnlock);
        } else {
            // Weighted-average unlock time for newly minted shares.
            uint256 weighted = (prevLocked * uint256(v.unlockTime)) + (shares * newUnlock);
            v.unlockTime = uint64(weighted / newLocked);
        }

        v.lockedShares = uint128(newLocked);
    }

    function _beforeWithdraw(address owner, uint256 assets) internal view {
        if (!isUserLocked(owner)) return;
        if (assets == 0) revert("zero assets");
        revert("locked");
    }

    function _beforeRedeem(address owner, uint256 shares) internal view {
        if (!isUserLocked(owner)) return;
        if (shares == 0) revert("zero shares");
        revert("locked");
    }

    function _afterWithdraw(address owner, uint256 sharesBurned) internal {
        VestingInfo storage v = _vesting[owner];
        if (v.lockedShares == 0) return;

        if (sharesBurned >= v.lockedShares) {
            v.lockedShares = 0;
            v.unlockTime = 0;
        } else {
            v.lockedShares = uint128(uint256(v.lockedShares) - sharesBurned);
        }

        if (block.timestamp >= v.unlockTime) {
            v.lockedShares = 0;
            v.unlockTime = 0;
        }
    }

}
