// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentSmartAccount} from "./AgentSmartAccount.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {IAgentAccountFactory} from "./interfaces/IAgentAccountFactory.sol";

/// @title AgentAccountFactory
/// @notice Factory for deploying AgentSmartAccount clones via ERC-1167 minimal proxies
/// @dev Uses CREATE2 (cloneDeterministic) so addresses can be predicted before deployment.
///      The salt is derived from (owner, agentId) to ensure uniqueness per owner-agent pair.
///      Also manages global trusted contracts/tokens that all agent accounts can access.
contract AgentAccountFactory is IAgentAccountFactory, Ownable {
    // -- State --

    /// @notice The AgentSmartAccount implementation contract (logic target for clones)
    address public immutable override implementation;

    /// @notice The canonical EntryPoint address
    IEntryPoint public immutable override entryPoint;

    /// @notice Mapping of globally trusted contract addresses (bypass per-agent allowlists)
    mapping(address => bool) public trustedContracts;

    /// @notice Mapping of globally trusted token addresses (bypass per-agent token allowlists)
    mapping(address => bool) public trustedTokens;

    // -- Constructor --

    /// @param _implementation Address of the deployed AgentSmartAccount implementation
    /// @param _entryPoint Address of the canonical ERC-4337 EntryPoint
    constructor(address _implementation, address _entryPoint) Ownable(msg.sender) {
        if (_implementation == address(0) || _entryPoint == address(0)) {
            revert ZeroAddress();
        }
        implementation = _implementation;
        entryPoint = IEntryPoint(_entryPoint);
    }

    // -- External functions --

    /// @inheritdoc IAgentAccountFactory
    function createAccount(
        address owner_,
        address operator_,
        bytes32 agentId_,
        uint256 dailyLimit_,
        uint256 expiresAt_
    ) external override returns (address account) {
        bytes32 salt = _computeSalt(owner_, agentId_);

        // Deploy the minimal proxy clone with CREATE2
        account = Clones.cloneDeterministic(implementation, salt);

        // Initialize the clone
        AgentSmartAccount(payable(account)).initialize(
            owner_,
            operator_,
            agentId_,
            dailyLimit_,
            expiresAt_
        );

        emit AccountCreated(account, owner_, operator_, agentId_);
    }

    /// @inheritdoc IAgentAccountFactory
    function getAddress(address owner_, bytes32 agentId_) external view override returns (address predicted) {
        bytes32 salt = _computeSalt(owner_, agentId_);
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    /// @inheritdoc IAgentAccountFactory
    function setTrustedContract(address target, bool trusted) external override onlyOwner {
        trustedContracts[target] = trusted;
        emit TrustedContractSet(target, trusted);
    }

    /// @inheritdoc IAgentAccountFactory
    function setTrustedToken(address token, bool trusted) external override onlyOwner {
        trustedTokens[token] = trusted;
        emit TrustedTokenSet(token, trusted);
    }

    /// @inheritdoc IAgentAccountFactory
    function isTrustedContract(address target) external view override returns (bool) {
        return trustedContracts[target];
    }

    /// @inheritdoc IAgentAccountFactory
    function isTrustedToken(address token) external view override returns (bool) {
        return trustedTokens[token];
    }

    // -- Internal functions --

    /// @dev Compute the deterministic salt from owner and agentId
    function _computeSalt(address owner_, bytes32 agentId_) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner_, agentId_));
    }
}
