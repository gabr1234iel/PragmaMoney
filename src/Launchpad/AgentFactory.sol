// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentPool} from "./AgentPool.sol";
import {Errors} from "../errors/Errors.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IReputationReporter} from "../interfaces/IReputationReporter.sol";

/// @title AgentFactory
/// @notice Registers agent identities (if needed) and deploys AgentPool instances.
contract AgentFactory is Ownable, IERC721Receiver {
    event AgentRegistered(address indexed agentAccount, uint256 indexed agentId, string agentURI);
    event AgentPoolCreated(address indexed agentAccount, uint256 indexed agentId, address pool);

    IIdentityRegistry public immutable identityRegistry;
    address public scoreOracle;
    address public reputationReporter;
    address public admin;

    mapping(uint256 => address) public poolByAgentId;
    uint256[] private _allAgentIds;

    struct CreateParams {
        string agentURI;
        IERC20 asset;
        string name;
        string symbol;
        address poolOwner;
        uint256 dailyCap;
        uint64 vestingDuration;
        string metadataURI;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        IIdentityRegistry identityRegistry_,
        address owner_,
        address admin_,
        address scoreOracle_,
        address reputationReporter_
    )
        Ownable(owner_)
    {
        if (address(identityRegistry_) == address(0)) revert Errors.BadIdentity();
        if (owner_ == address(0)) revert Errors.BadOwner();
        if (admin_ == address(0)) revert Errors.BadOwner();
        if (scoreOracle_ == address(0)) revert Errors.BadTarget();
        if (reputationReporter_ == address(0)) revert Errors.BadTarget();
        identityRegistry = identityRegistry_;
        scoreOracle = scoreOracle_;
        reputationReporter = reputationReporter_;
        admin = admin_;
    }

    modifier onlyOwnerOrAdmin() {
        if (msg.sender != owner() && msg.sender != admin) revert Errors.NotAuthorized();
        _;
    }

    modifier onlyOwnerOrAdminOrAgentOwner(uint256 agentId) {
        if (msg.sender != owner() && msg.sender != admin
            && !identityRegistry.isAuthorizedOrOwner(msg.sender, agentId))
            revert Errors.NotAuthorized();
        _;
    }

    function setAdmin(address newAdmin) external onlyOwner {
        if (newAdmin == address(0)) revert Errors.BadOwner();
        admin = newAdmin;
    }

    /// @notice Update the score oracle used for newly created pools.
    function setScoreOracle(address newOracle) external onlyOwnerOrAdmin {
        if (newOracle == address(0)) revert Errors.BadTarget();
        scoreOracle = newOracle;
    }

    function setReputationReporter(address newReporter) external onlyOwnerOrAdmin {
        if (newReporter == address(0)) revert Errors.BadTarget();
        reputationReporter = newReporter;
    }

    /// @notice Link an existing agentId to an agent account.
    /// @dev Caller must be the agent account (owner of the token).
    /// @notice Register the agent (if needed) and deploy a new AgentPool.
    /// @dev Authorized caller deploys on behalf of agentAccount.
    function createAgentPool(uint256 agentId, address agentAccount, CreateParams calldata p)
        external
        onlyOwnerOrAdminOrAgentOwner(agentId)
        returns (address pool)
    {
        if (agentAccount == address(0)) revert Errors.BadAgent();
        if (address(p.asset) == address(0)) revert Errors.BadAsset();
        if (p.poolOwner == address(0)) revert Errors.BadPoolOwner();

        // Ensure agentId exists and matches registered wallet.
        identityRegistry.ownerOf(agentId);
        address registeredWallet = identityRegistry.getAgentWallet(agentId);
        if (registeredWallet == address(0) || registeredWallet != agentAccount) revert Errors.BadWallet();

        if (poolByAgentId[agentId] != address(0)) revert Errors.PoolExists();
        pool = address(new AgentPool(
            p.asset,
            p.name,
            p.symbol,
            p.poolOwner,
            admin,
            identityRegistry,
            agentId,
            scoreOracle,
            p.dailyCap,
            p.vestingDuration,
            p.metadataURI
        ));

        poolByAgentId[agentId] = pool;
        _allAgentIds.push(agentId);
        IReputationReporter(reputationReporter).setReporter(agentAccount, true);
        emit AgentPoolCreated(agentAccount, agentId, pool);
    }

    function agentCount() external view returns (uint256) {
        return _allAgentIds.length;
    }

    function getAgentIdAt(uint256 index) external view returns (uint256) {
        if (index >= _allAgentIds.length) revert Errors.IndexOutOfBounds();
        return _allAgentIds[index];
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
