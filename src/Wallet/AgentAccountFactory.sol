// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AgentSmartAccount} from "./AgentSmartAccount.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";

/// @title AgentAccountFactory
/// @notice Factory for deploying AgentSmartAccount clones via ERC-1167 minimal proxies
/// @dev Uses CREATE2 (cloneDeterministic) so addresses can be predicted before deployment.
///      The salt is derived from (owner, agentId) to ensure uniqueness per owner-agent pair.
contract AgentAccountFactory {
    // -- State --

    /// @notice The AgentSmartAccount implementation contract (logic target for clones)
    address public immutable implementation;

    /// @notice The canonical EntryPoint address
    IEntryPoint public immutable entryPoint;

    // -- Events --

    event AccountCreated(
        address indexed account,
        address indexed owner,
        address indexed operator,
        bytes32 agentId
    );

    // -- Custom errors --

    error AccountAlreadyExists(address account);
    error ZeroAddress();

    // -- Constructor --

    /// @param _implementation Address of the deployed AgentSmartAccount implementation
    /// @param _entryPoint Address of the canonical ERC-4337 EntryPoint
    constructor(address _implementation, address _entryPoint) {
        if (_implementation == address(0) || _entryPoint == address(0)) {
            revert ZeroAddress();
        }
        implementation = _implementation;
        entryPoint = IEntryPoint(_entryPoint);
    }

    // -- External functions --

    /// @notice Deploy a new AgentSmartAccount clone
    /// @param owner_ The owner address (controls policy)
    /// @param operator_ The operator address (signs UserOps)
    /// @param agentId_ Unique identifier for the agent
    /// @param dailyLimit_ Maximum daily spending in token base units
    /// @param expiresAt_ Unix timestamp when the account expires
    /// @return account The address of the newly deployed smart account
    function createAccount(
        address owner_,
        address operator_,
        bytes32 agentId_,
        uint256 dailyLimit_,
        uint256 expiresAt_
    ) external returns (address account) {
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

    /// @notice Predict the address of a clone without deploying
    /// @param owner_ The owner address
    /// @param agentId_ The agent identifier
    /// @return predicted The predicted clone address
    function getAddress(address owner_, bytes32 agentId_) external view returns (address predicted) {
        bytes32 salt = _computeSalt(owner_, agentId_);
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    // -- Internal functions --

    /// @dev Compute the deterministic salt from owner and agentId
    function _computeSalt(address owner_, bytes32 agentId_) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner_, agentId_));
    }
}