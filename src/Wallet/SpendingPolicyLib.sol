// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SpendingPolicyLib
/// @notice Library for validating and enforcing agent wallet spending policies
/// @dev Used by AgentSmartAccount to enforce constraints on UserOp execution
library SpendingPolicyLib {
    /// @notice Spending policy configuration
    /// @param dailyLimit Maximum amount (in token base units) that can be spent per 24h rolling window
    /// @param expiresAt Unix timestamp after which the account can no longer transact
    /// @param requiresApprovalAbove Amount threshold above which manual owner approval is required
    struct Policy {
        uint256 dailyLimit;
        uint256 expiresAt;
        uint256 requiresApprovalAbove;
    }

    /// @notice Tracks cumulative daily spend for rolling limit enforcement
    /// @param amount Total amount spent in the current 24h window
    /// @param lastReset Timestamp when the current window started
    struct DailySpend {
        uint256 amount;
        uint256 lastReset;
    }

    /// @notice Duration of one spending window
    uint256 internal constant DAY = 24 hours;

    // -- Custom errors --

    error TargetNotAllowed(address target);
    error TokenNotAllowed(address token);
    error PolicyExpired(uint256 expiresAt, uint256 currentTime);
    error DailyLimitExceeded(uint256 requested, uint256 remaining);
    error RequiresApproval(uint256 amount, uint256 threshold);

    // -- Validation functions --

    /// @notice Check whether a target address is in the allow-list
    /// @param allowedTargets Storage mapping of allowed targets
    /// @param target The address to check
    /// @return True if the target is allowed
    function validateTarget(
        mapping(address => bool) storage allowedTargets,
        address target
    ) internal view returns (bool) {
        if (!allowedTargets[target]) {
            revert TargetNotAllowed(target);
        }
        return true;
    }

    /// @notice Check whether a token address is in the allow-list
    /// @param allowedTokens Storage mapping of allowed tokens
    /// @param token The token address to check
    /// @return True if the token is allowed
    function validateToken(
        mapping(address => bool) storage allowedTokens,
        address token
    ) internal view returns (bool) {
        if (!allowedTokens[token]) {
            revert TokenNotAllowed(token);
        }
        return true;
    }

    /// @notice Check whether the policy has not expired
    /// @param policy The policy to check
    /// @return True if the policy is still valid
    function validateExpiry(Policy storage policy) internal view returns (bool) {
        if (block.timestamp > policy.expiresAt) {
            revert PolicyExpired(policy.expiresAt, block.timestamp);
        }
        return true;
    }

    /// @notice Check whether a spend amount is within the daily limit
    /// @dev Automatically resets the window if 24h have passed
    /// @param policy The policy containing the daily limit
    /// @param daily The current daily spend tracker
    /// @param amount The amount being requested
    /// @return True if the spend is within limits
    function validateDailyLimit(
        Policy storage policy,
        DailySpend storage daily,
        uint256 amount
    ) internal view returns (bool) {
        uint256 currentAmount = daily.amount;

        // If a new day has started, the effective spent amount is 0
        if (block.timestamp >= daily.lastReset + DAY) {
            currentAmount = 0;
        }

        uint256 remaining = policy.dailyLimit > currentAmount
            ? policy.dailyLimit - currentAmount
            : 0;

        if (amount > remaining) {
            revert DailyLimitExceeded(amount, remaining);
        }
        return true;
    }

    /// @notice Record a spend and reset the window if needed
    /// @param daily The daily spend tracker to update
    /// @param amount The amount being spent
    function recordSpend(DailySpend storage daily, uint256 amount) internal {
        resetDailyIfNeeded(daily);
        daily.amount += amount;
    }

    /// @notice Reset the daily spend tracker if 24h have elapsed
    /// @param daily The daily spend tracker
    function resetDailyIfNeeded(DailySpend storage daily) internal {
        if (block.timestamp >= daily.lastReset + DAY) {
            daily.amount = 0;
            daily.lastReset = block.timestamp;
        }
    }
}
