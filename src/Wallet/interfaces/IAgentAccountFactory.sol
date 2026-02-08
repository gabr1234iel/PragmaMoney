// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";

/// @title IAgentAccountFactory
/// @notice Interface for the AgentSmartAccount factory with global trusted contracts
interface IAgentAccountFactory {
    // -- Events --
    event AccountCreated(
        address indexed account,
        address indexed owner,
        address indexed operator,
        bytes32 agentId
    );
    event TrustedContractSet(address indexed target, bool trusted);
    event TrustedTokenSet(address indexed token, bool trusted);

    // -- Errors --
    error AccountAlreadyExists(address account);
    error ZeroAddress();

    // -- View functions --

    /// @notice The AgentSmartAccount implementation contract (logic target for clones)
    function implementation() external view returns (address);

    /// @notice The canonical EntryPoint address
    function entryPoint() external view returns (IEntryPoint);

    /// @notice Check if a contract is globally trusted (allowed for all agents)
    /// @param target The contract address to check
    /// @return trusted Whether the contract is globally trusted
    function isTrustedContract(address target) external view returns (bool trusted);

    /// @notice Check if a token is globally trusted (allowed for all agents)
    /// @param token The token address to check
    /// @return trusted Whether the token is globally trusted
    function isTrustedToken(address token) external view returns (bool trusted);

    /// @notice Predict the address of a clone without deploying
    /// @param owner_ The owner address
    /// @param agentId_ The agent identifier
    /// @return predicted The predicted clone address
    function getAddress(address owner_, bytes32 agentId_) external view returns (address predicted);

    // -- State-changing functions --

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
    ) external returns (address account);

    /// @notice Set whether a contract is globally trusted (owner only)
    /// @param target The contract address
    /// @param trusted Whether it should be trusted
    function setTrustedContract(address target, bool trusted) external;

    /// @notice Set whether a token is globally trusted (owner only)
    /// @param token The token address
    /// @param trusted Whether it should be trusted
    function setTrustedToken(address token, bool trusted) external;
}
