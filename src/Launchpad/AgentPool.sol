// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Auth, Authority} from "../components/Authorities/Auth.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

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
contract AgentPool is ERC4626, Auth, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct VestingInfo {
        uint128 lockedShares;
        uint64 unlockTime;
    }

    event AgentPulled(uint64 indexed dayIndex, address indexed to, uint256 assets, uint256 spentToday, uint256 cap);
    event AgentAccountUpdated(address indexed oldAgent, address indexed newAgent);
    event DailyCapUpdated(uint256 oldCap, uint256 newCap);
    event AgentRevoked(bool revoked);
    event VestingParamsUpdated(uint64 vestingDuration);
    event AllowedPullTargetUpdated(address indexed target, bool allowed);

    address public agentAccount;
    bool public agentRevoked;

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
        Authority authority_,
        address agentAccount_,
        uint256 dailyCap_,
        uint64 vestingDuration_
    ) ERC4626(asset_) ERC20(name_, symbol_) {
        require(address(asset_) != address(0), "bad asset");
        require(owner_ != address(0), "bad owner");
        require(agentAccount_ != address(0), "bad agent");

        owner = owner_;
        authority = authority_;
        emit OwnershipTransferred(msg.sender, owner_);
        emit AuthorityUpdated(msg.sender, authority_);

        agentAccount = agentAccount_;
        dailyCap = dailyCap_;
        vestingDuration = vestingDuration_;
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

    /// @notice Update the agent account.
    function setAgentAccount(address newAgent) external requiresAuth {
        require(newAgent != address(0), "bad agent");
        address old = agentAccount;
        agentAccount = newAgent;
        emit AgentAccountUpdated(old, newAgent);
    }

    /// @notice Update the daily pull cap.
    function setDailyCap(uint256 newCap) external requiresAuth {
        uint256 old = dailyCap;
        dailyCap = newCap;
        emit DailyCapUpdated(old, newCap);
    }

    /// @notice Enable/disable a pull target.
    function setAllowedPullTarget(address target, bool allowed) external requiresAuth {
        require(target != address(0), "bad target");
        allowedPullTarget[target] = allowed;
        emit AllowedPullTargetUpdated(target, allowed);
    }

    /// @notice Enable or disable allowlist enforcement.
    function setAllowlistEnabled(bool enabled) external requiresAuth {
        allowlistEnabled = enabled;
    }

    /// @notice Revoke agent pull privileges.
    function revokeAgent() external requiresAuth {
        agentRevoked = true;
        emit AgentRevoked(true);
    }

    /// @notice Restore agent pull privileges.
    function unrevokeAgent() external requiresAuth {
        agentRevoked = false;
        emit AgentRevoked(false);
    }

    /// @notice Update vesting parameters.
    function setVestingParams(uint64 vestingDuration_) external requiresAuth {
        vestingDuration = vestingDuration_;
        emit VestingParamsUpdated(vestingDuration_);
    }

    /// @notice Pause deposits, mints, and pulls. Withdrawals/redeems remain available.
    function pause() external requiresAuth {
        _pause();
    }

    /// @notice Unpause deposits, mints, and pulls.
    function unpause() external requiresAuth {
        _unpause();
    }

    /// @notice Rescue non-asset tokens sent to the vault.
    /// @dev Underlying asset rescue is only allowed when paused, to avoid rug-like behavior.
    function rescueTokens(address token, address to, uint256 amount) external requiresAuth {
        require(to != address(0), "bad to");
        if (token == address(asset())) {
            require(paused(), "asset rescue requires pause");
        }
        IERC20(token).safeTransfer(to, amount);
    }

    /*//////////////////////////////////////////////////////////////
                             AGENT PULL
    //////////////////////////////////////////////////////////////*/

    modifier whenAgentActive() {
        require(!agentRevoked, "agent revoked");
        _;
    }

    /// @notice Pull assets from the vault, constrained by daily cap and allowlist.
    function pull(address to, uint256 assets) external nonReentrant whenNotPaused whenAgentActive {
        require(msg.sender == agentAccount, "not agent");
        require(to != address(0), "bad to");
        if (allowlistEnabled) {
            require(allowedPullTarget[to], "target not allowed");
        }

        uint64 dayIndex = getDayIndex(block.timestamp);
        if (dayIndex != currentDay) {
            currentDay = dayIndex;
            spentToday = 0;
        }

        require(spentToday + assets <= dailyCap, "cap exceeded");
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
        require(receiver != address(0), "bad receiver");
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
        require(receiver != address(0), "bad receiver");
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
        revert("locked");
        if (assets == 0) revert("zero assets");
    }

    function _beforeRedeem(address owner, uint256 shares) internal view {
        if (!isUserLocked(owner)) return;
        revert("locked");
        if (shares == 0) revert("zero shares");
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
