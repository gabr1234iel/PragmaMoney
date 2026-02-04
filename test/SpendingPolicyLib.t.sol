// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {SpendingPolicyLib} from "../src/Wallet/SpendingPolicyLib.sol";

/// @dev Wrapper contract to test the library functions against real storage
contract PolicyHarness {
    using SpendingPolicyLib for mapping(address => bool);

    SpendingPolicyLib.Policy public policy;
    SpendingPolicyLib.DailySpend public dailySpend;
    mapping(address => bool) public allowedTargets;
    mapping(address => bool) public allowedTokens;

    function setPolicy(uint256 dailyLimit, uint256 expiresAt, uint256 requiresApprovalAbove) external {
        policy = SpendingPolicyLib.Policy({
            dailyLimit: dailyLimit,
            expiresAt: expiresAt,
            requiresApprovalAbove: requiresApprovalAbove
        });
    }

    function setDailySpend(uint256 amount, uint256 lastReset) external {
        dailySpend = SpendingPolicyLib.DailySpend({
            amount: amount,
            lastReset: lastReset
        });
    }

    function setAllowedTarget(address target, bool allowed) external {
        allowedTargets[target] = allowed;
    }

    function setAllowedToken(address token, bool allowed) external {
        allowedTokens[token] = allowed;
    }

    function callValidateTarget(address target) external view returns (bool) {
        return SpendingPolicyLib.validateTarget(allowedTargets, target);
    }

    function callValidateToken(address token) external view returns (bool) {
        return SpendingPolicyLib.validateToken(allowedTokens, token);
    }

    function callValidateExpiry() external view returns (bool) {
        return SpendingPolicyLib.validateExpiry(policy);
    }

    function callValidateDailyLimit(uint256 amount) external view returns (bool) {
        return SpendingPolicyLib.validateDailyLimit(policy, dailySpend, amount);
    }

    function callRecordSpend(uint256 amount) external {
        SpendingPolicyLib.recordSpend(dailySpend, amount);
    }

    function callResetDailyIfNeeded() external {
        SpendingPolicyLib.resetDailyIfNeeded(dailySpend);
    }

    function getDailySpendAmount() external view returns (uint256) {
        return dailySpend.amount;
    }

    function getDailySpendLastReset() external view returns (uint256) {
        return dailySpend.lastReset;
    }
}

contract SpendingPolicyLibTest is Test {
    PolicyHarness public harness;

    address public constant TARGET_A = address(0xA);
    address public constant TARGET_B = address(0xB);
    address public constant TOKEN_A = address(0xC);

    uint256 public constant DAILY_LIMIT = 1000e6; // 1000 USDC
    uint256 public expiresAt;

    function setUp() public {
        harness = new PolicyHarness();
        expiresAt = block.timestamp + 30 days;

        harness.setPolicy(DAILY_LIMIT, expiresAt, 0);
        harness.setDailySpend(0, block.timestamp);
        harness.setAllowedTarget(TARGET_A, true);
        harness.setAllowedToken(TOKEN_A, true);
    }

    // ==================== validateTarget ====================

    function test_ValidateTarget_Allowed() public view {
        assertTrue(harness.callValidateTarget(TARGET_A));
    }

    function test_ValidateTarget_RevertNotAllowed() public {
        vm.expectRevert(
            abi.encodeWithSelector(SpendingPolicyLib.TargetNotAllowed.selector, TARGET_B)
        );
        harness.callValidateTarget(TARGET_B);
    }

    // ==================== validateToken ====================

    function test_ValidateToken_Allowed() public view {
        assertTrue(harness.callValidateToken(TOKEN_A));
    }

    function test_ValidateToken_RevertNotAllowed() public {
        address badToken = address(0xDEAD);
        vm.expectRevert(
            abi.encodeWithSelector(SpendingPolicyLib.TokenNotAllowed.selector, badToken)
        );
        harness.callValidateToken(badToken);
    }

    // ==================== validateExpiry ====================

    function test_ValidateExpiry_NotExpired() public view {
        assertTrue(harness.callValidateExpiry());
    }

    function test_ValidateExpiry_RevertExpired() public {
        // Warp past expiry
        vm.warp(expiresAt + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingPolicyLib.PolicyExpired.selector,
                expiresAt,
                block.timestamp
            )
        );
        harness.callValidateExpiry();
    }

    function test_ValidateExpiry_ExactExpiryIsValid() public {
        vm.warp(expiresAt);
        // At exactly expiresAt, block.timestamp == expiresAt, so block.timestamp > expiresAt is false
        assertTrue(harness.callValidateExpiry());
    }

    // ==================== validateDailyLimit ====================

    function test_ValidateDailyLimit_WithinLimit() public view {
        assertTrue(harness.callValidateDailyLimit(500e6));
    }

    function test_ValidateDailyLimit_ExactLimit() public view {
        assertTrue(harness.callValidateDailyLimit(DAILY_LIMIT));
    }

    function test_ValidateDailyLimit_RevertExceedsLimit() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingPolicyLib.DailyLimitExceeded.selector,
                DAILY_LIMIT + 1,
                DAILY_LIMIT
            )
        );
        harness.callValidateDailyLimit(DAILY_LIMIT + 1);
    }

    function test_ValidateDailyLimit_AfterPartialSpend() public {
        // Record 600 USDC spent
        harness.callRecordSpend(600e6);

        // 400 USDC remaining - should pass
        assertTrue(harness.callValidateDailyLimit(400e6));

        // 401 USDC - should fail
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingPolicyLib.DailyLimitExceeded.selector,
                401e6,
                400e6
            )
        );
        harness.callValidateDailyLimit(401e6);
    }

    function test_ValidateDailyLimit_ResetsAfter24Hours() public {
        // Spend the full limit
        harness.callRecordSpend(DAILY_LIMIT);

        // Immediately should fail for any amount
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendingPolicyLib.DailyLimitExceeded.selector,
                1,
                0
            )
        );
        harness.callValidateDailyLimit(1);

        // Warp 24 hours forward
        vm.warp(block.timestamp + 24 hours);

        // Should now be able to spend full limit again
        assertTrue(harness.callValidateDailyLimit(DAILY_LIMIT));
    }

    // ==================== recordSpend ====================

    function test_RecordSpend_Updates() public {
        harness.callRecordSpend(100e6);
        assertEq(harness.getDailySpendAmount(), 100e6);

        harness.callRecordSpend(200e6);
        assertEq(harness.getDailySpendAmount(), 300e6);
    }

    function test_RecordSpend_ResetsAndRecords() public {
        harness.callRecordSpend(500e6);
        assertEq(harness.getDailySpendAmount(), 500e6);

        // Warp past reset window
        vm.warp(block.timestamp + 24 hours);

        // Record should reset then add
        harness.callRecordSpend(100e6);
        assertEq(harness.getDailySpendAmount(), 100e6);
    }

    // ==================== resetDailyIfNeeded ====================

    function test_ResetDailyIfNeeded_NoResetWithinWindow() public {
        harness.callRecordSpend(500e6);
        uint256 originalReset = harness.getDailySpendLastReset();

        // Warp less than 24h
        vm.warp(block.timestamp + 12 hours);
        harness.callResetDailyIfNeeded();

        assertEq(harness.getDailySpendAmount(), 500e6);
        assertEq(harness.getDailySpendLastReset(), originalReset);
    }

    function test_ResetDailyIfNeeded_ResetsAfterWindow() public {
        harness.callRecordSpend(500e6);

        vm.warp(block.timestamp + 24 hours);
        harness.callResetDailyIfNeeded();

        assertEq(harness.getDailySpendAmount(), 0);
        assertEq(harness.getDailySpendLastReset(), block.timestamp);
    }

    // ==================== Fuzz tests ====================

    function testFuzz_ValidateDailyLimit_BoundedAmount(uint256 amount) public view {
        amount = bound(amount, 0, DAILY_LIMIT);
        assertTrue(harness.callValidateDailyLimit(amount));
    }

    function testFuzz_ValidateDailyLimit_ExceedingAlwaysFails(uint256 amount) public {
        amount = bound(amount, DAILY_LIMIT + 1, type(uint256).max);
        vm.expectRevert();
        harness.callValidateDailyLimit(amount);
    }

    function testFuzz_RecordSpend_Cumulative(uint256 a, uint256 b) public {
        a = bound(a, 0, type(uint128).max);
        b = bound(b, 0, type(uint128).max);

        harness.callRecordSpend(a);
        harness.callRecordSpend(b);

        assertEq(harness.getDailySpendAmount(), a + b);
    }
}
