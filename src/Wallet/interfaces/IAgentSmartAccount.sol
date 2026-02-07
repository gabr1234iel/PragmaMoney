// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SpendingPolicyLib} from "../SpendingPolicyLib.sol";

/// @title IAgentSmartAccount
/// @notice Interface for the PragmaMoney ERC-4337 agent smart account
interface IAgentSmartAccount {
    event PolicyUpdated(uint256 dailyLimit, uint256 expiresAt, uint256 requiresApprovalAbove);
    event TargetAllowedUpdated(address indexed target, bool allowed);
    event TokenAllowedUpdated(address indexed token, bool allowed);
    event Executed(address indexed dest, uint256 value, bytes func);
    event BatchExecuted(uint256 count);
    /// @notice Initialize the smart account (called once after clone deployment)
    /// @param owner_ The owner address (controls policy)
    /// @param operator_ The operator address (signs UserOps)
    /// @param agentId_ Unique identifier for the agent
    /// @param dailyLimit_ Maximum daily spending in USDC (6 decimals)
    /// @param expiresAt_ Unix timestamp when the account expires
    function initialize(
        address owner_,
        address operator_,
        bytes32 agentId_,
        uint256 dailyLimit_,
        uint256 expiresAt_
    ) external;

    /// @notice Execute a single call (only callable via EntryPoint)
    /// @param dest Target address
    /// @param value ETH value to send
    /// @param func Calldata for the call
    function execute(address dest, uint256 value, bytes calldata func) external;

    /// @notice Execute multiple calls in batch (only callable via EntryPoint)
    /// @param dest Array of target addresses
    /// @param values Array of ETH values
    /// @param func Array of calldata
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata values,
        bytes[] calldata func
    ) external;

    /// @notice Update the spending policy (only callable by owner)
    /// @param dailyLimit_ New daily limit
    /// @param expiresAt_ New expiration timestamp
    /// @param requiresApprovalAbove_ Threshold for requiring approval
    function updatePolicy(
        uint256 dailyLimit_,
        uint256 expiresAt_,
        uint256 requiresApprovalAbove_
    ) external;

    /// @notice Set whether a target address is allowed (only callable by owner)
    /// @param target The target address
    /// @param allowed Whether it should be allowed
    function setTargetAllowed(address target, bool allowed) external;

    /// @notice Set whether a token address is allowed (only callable by owner)
    /// @param token The token address
    /// @param allowed Whether it should be allowed
    function setTokenAllowed(address token, bool allowed) external;

    /// @notice Get the current spending policy
    /// @return policy The Policy struct
    function getPolicy() external view returns (SpendingPolicyLib.Policy memory policy);

    /// @notice Get the current daily spend info
    /// @return dailySpend The DailySpend struct
    function getDailySpend() external view returns (SpendingPolicyLib.DailySpend memory dailySpend);

    /// @notice Check if a target is allowed
    /// @param target The target address to check
    /// @return allowed Whether the target is allowed
    function isTargetAllowed(address target) external view returns (bool allowed);

    /// @notice Check if a token is allowed
    /// @param token The token address to check
    /// @return allowed Whether the token is allowed
    function isTokenAllowed(address token) external view returns (bool allowed);

    // Merkle allowlist removed
}
