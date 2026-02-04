// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {AgentSmartAccount} from "../src/Wallet/AgentSmartAccount.sol";
import {AgentAccountFactory} from "../src/Wallet/AgentAccountFactory.sol";
import {SpendingPolicyLib} from "../src/Wallet/SpendingPolicyLib.sol";
import {MockERC20} from "./helpers/MockERC20.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";

contract AgentSmartAccountTest is Test {
    AgentSmartAccount public implementation;
    AgentAccountFactory public factory;
    AgentSmartAccount public account;
    MockERC20 public usdc;

    // The canonical EntryPoint
    address public constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    address public owner;
    uint256 public ownerKey;
    address public operator;
    uint256 public operatorKey;
    address public stranger = makeAddr("stranger");

    bytes32 public constant AGENT_ID = keccak256("test-agent-1");
    uint256 public constant DAILY_LIMIT = 1000e6; // 1000 USDC
    uint256 public expiresAt;

    address public allowedTarget;
    address public blockedTarget = makeAddr("blockedTarget");

    function setUp() public {
        // Generate owner and operator keys
        (owner, ownerKey) = makeAddrAndKey("owner");
        (operator, operatorKey) = makeAddrAndKey("operator");

        // Deploy USDC mock
        usdc = new MockERC20("USD Coin", "USDC", 6);
        allowedTarget = address(usdc);

        // Expiry: 30 days from now
        expiresAt = block.timestamp + 30 days;

        // Deploy implementation
        implementation = new AgentSmartAccount();

        // Deploy factory
        factory = new AgentAccountFactory(address(implementation), ENTRY_POINT);

        // Create account via factory
        address accountAddr = factory.createAccount(
            owner,
            operator,
            AGENT_ID,
            DAILY_LIMIT,
            expiresAt
        );
        account = AgentSmartAccount(payable(accountAddr));

        // Owner sets allowed targets and tokens
        vm.startPrank(owner);
        account.setTargetAllowed(allowedTarget, true);
        account.setTokenAllowed(address(usdc), true);
        vm.stopPrank();

        // Fund the smart account with USDC and ETH
        usdc.mint(address(account), 10_000e6);
        vm.deal(address(account), 10 ether);

        // Label addresses for trace readability
        vm.label(address(account), "AgentSmartAccount");
        vm.label(address(usdc), "USDC");
        vm.label(owner, "Owner");
        vm.label(operator, "Operator");
        vm.label(ENTRY_POINT, "EntryPoint");
    }

    // ==================== Initialization ====================

    function test_Initialize_SetsCorrectState() public view {
        assertEq(account.owner(), owner);
        assertEq(account.operator(), operator);
        assertEq(account.agentId(), AGENT_ID);

        SpendingPolicyLib.Policy memory pol = account.getPolicy();
        assertEq(pol.dailyLimit, DAILY_LIMIT);
        assertEq(pol.expiresAt, expiresAt);
        assertEq(pol.requiresApprovalAbove, 0);
    }

    function test_Initialize_CannotReinitialize() public {
        vm.expectRevert(); // Initializable: contract is already initialized
        account.initialize(stranger, stranger, keccak256("x"), 1, 1);
    }

    function test_Implementation_CannotBeInitialized() public {
        vm.expectRevert(); // Initializable: contract is already initialized
        implementation.initialize(stranger, stranger, keccak256("x"), 1, 1);
    }

    // ==================== Factory ====================

    function test_Factory_PredictAddress() public view {
        address predicted = factory.getAddress(owner, AGENT_ID);
        assertEq(predicted, address(account));
    }

    function test_Factory_DuplicateReverts() public {
        vm.expectRevert(); // Clones: clone already deployed
        factory.createAccount(owner, operator, AGENT_ID, DAILY_LIMIT, expiresAt);
    }

    function test_Factory_DifferentAgentIdDifferentAddress() public {
        bytes32 newAgentId = keccak256("agent-2");
        address newAccount = factory.createAccount(
            owner,
            operator,
            newAgentId,
            DAILY_LIMIT,
            expiresAt
        );
        assertTrue(newAccount != address(account));
    }

    // ==================== Policy validation: Target ====================

    function test_PolicyTarget_AllowedTargetIsAllowed() public view {
        assertTrue(account.isTargetAllowed(allowedTarget));
    }

    function test_PolicyTarget_BlockedTargetIsBlocked() public view {
        assertFalse(account.isTargetAllowed(blockedTarget));
    }

    function test_PolicyTarget_OwnerCanUpdateTarget() public {
        vm.prank(owner);
        account.setTargetAllowed(blockedTarget, true);
        assertTrue(account.isTargetAllowed(blockedTarget));

        vm.prank(owner);
        account.setTargetAllowed(blockedTarget, false);
        assertFalse(account.isTargetAllowed(blockedTarget));
    }

    function test_PolicyTarget_StrangerCannotUpdateTarget() public {
        vm.prank(stranger);
        vm.expectRevert(AgentSmartAccount.OnlyOwner.selector);
        account.setTargetAllowed(blockedTarget, true);
    }

    // ==================== Policy validation: Token ====================

    function test_PolicyToken_AllowedTokenIsAllowed() public view {
        assertTrue(account.isTokenAllowed(address(usdc)));
    }

    function test_PolicyToken_UnknownTokenIsBlocked() public view {
        assertFalse(account.isTokenAllowed(address(0xdead)));
    }

    function test_PolicyToken_OwnerCanUpdateToken() public {
        address newToken = makeAddr("newToken");

        vm.prank(owner);
        account.setTokenAllowed(newToken, true);
        assertTrue(account.isTokenAllowed(newToken));

        vm.prank(owner);
        account.setTokenAllowed(newToken, false);
        assertFalse(account.isTokenAllowed(newToken));
    }

    function test_PolicyToken_StrangerCannotUpdateToken() public {
        vm.prank(stranger);
        vm.expectRevert(AgentSmartAccount.OnlyOwner.selector);
        account.setTokenAllowed(makeAddr("token"), true);
    }

    // ==================== Policy validation: Expiry ====================

    function test_PolicyExpiry_NotExpiredPasses() public view {
        SpendingPolicyLib.Policy memory pol = account.getPolicy();
        assertTrue(block.timestamp <= pol.expiresAt);
    }

    function test_PolicyExpiry_UpdateExpiryWorks() public {
        uint256 newExpiry = block.timestamp + 365 days;
        vm.prank(owner);
        account.updatePolicy(DAILY_LIMIT, newExpiry, 0);

        SpendingPolicyLib.Policy memory pol = account.getPolicy();
        assertEq(pol.expiresAt, newExpiry);
    }

    // ==================== Policy validation: Daily Limit ====================

    function test_PolicyDailyLimit_DefaultIsCorrect() public view {
        SpendingPolicyLib.Policy memory pol = account.getPolicy();
        assertEq(pol.dailyLimit, DAILY_LIMIT);
    }

    function test_PolicyDailyLimit_UpdateWorks() public {
        uint256 newLimit = 5000e6;
        vm.prank(owner);
        account.updatePolicy(newLimit, expiresAt, 0);

        SpendingPolicyLib.Policy memory pol = account.getPolicy();
        assertEq(pol.dailyLimit, newLimit);
    }

    // ==================== updatePolicy ====================

    function test_UpdatePolicy_FullUpdate() public {
        uint256 newLimit = 2000e6;
        uint256 newExpiry = block.timestamp + 60 days;
        uint256 newApproval = 500e6;

        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit AgentSmartAccount.PolicyUpdated(newLimit, newExpiry, newApproval);

        account.updatePolicy(newLimit, newExpiry, newApproval);

        SpendingPolicyLib.Policy memory pol = account.getPolicy();
        assertEq(pol.dailyLimit, newLimit);
        assertEq(pol.expiresAt, newExpiry);
        assertEq(pol.requiresApprovalAbove, newApproval);
    }

    function test_UpdatePolicy_RevertNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(AgentSmartAccount.OnlyOwner.selector);
        account.updatePolicy(1, 1, 1);
    }

    function test_UpdatePolicy_OperatorCannotUpdate() public {
        vm.prank(operator);
        vm.expectRevert(AgentSmartAccount.OnlyOwner.selector);
        account.updatePolicy(1, 1, 1);
    }

    // ==================== execute ====================

    function test_Execute_RevertNotEntryPoint() public {
        vm.prank(owner);
        vm.expectRevert(AgentSmartAccount.OnlyEntryPoint.selector);
        account.execute(allowedTarget, 0, "");
    }

    function test_Execute_RevertStrangerNotEntryPoint() public {
        vm.prank(stranger);
        vm.expectRevert(AgentSmartAccount.OnlyEntryPoint.selector);
        account.execute(allowedTarget, 0, "");
    }

    function test_Execute_SuccessViaEntryPoint() public {
        address recipient = makeAddr("recipient");
        uint256 transferAmount = 100e6;

        bytes memory transferData = abi.encodeWithSelector(
            usdc.transfer.selector,
            recipient,
            transferAmount
        );

        vm.prank(ENTRY_POINT);
        account.execute(address(usdc), 0, transferData);

        assertEq(usdc.balanceOf(recipient), transferAmount);
    }

    // ==================== executeBatch ====================

    function test_ExecuteBatch_RevertNotEntryPoint() public {
        address[] memory dests = new address[](1);
        dests[0] = allowedTarget;
        uint256[] memory values = new uint256[](1);
        bytes[] memory funcs = new bytes[](1);

        vm.prank(stranger);
        vm.expectRevert(AgentSmartAccount.OnlyEntryPoint.selector);
        account.executeBatch(dests, values, funcs);
    }

    function test_ExecuteBatch_RevertLengthMismatch() public {
        address[] memory dests = new address[](2);
        uint256[] memory values = new uint256[](1);
        bytes[] memory funcs = new bytes[](2);

        vm.prank(ENTRY_POINT);
        vm.expectRevert(AgentSmartAccount.BatchLengthMismatch.selector);
        account.executeBatch(dests, values, funcs);
    }

    function test_ExecuteBatch_SuccessViaEntryPoint() public {
        address recipient1 = makeAddr("recipient1");
        address recipient2 = makeAddr("recipient2");

        address[] memory dests = new address[](2);
        dests[0] = address(usdc);
        dests[1] = address(usdc);

        uint256[] memory values = new uint256[](2);
        values[0] = 0;
        values[1] = 0;

        bytes[] memory funcs = new bytes[](2);
        funcs[0] = abi.encodeWithSelector(usdc.transfer.selector, recipient1, 50e6);
        funcs[1] = abi.encodeWithSelector(usdc.transfer.selector, recipient2, 75e6);

        vm.prank(ENTRY_POINT);
        account.executeBatch(dests, values, funcs);

        assertEq(usdc.balanceOf(recipient1), 50e6);
        assertEq(usdc.balanceOf(recipient2), 75e6);
    }

    // ==================== EntryPoint ====================

    function test_EntryPoint_ReturnsCanonical() public view {
        assertEq(address(account.entryPoint()), ENTRY_POINT);
    }

    // ==================== Receive ETH ====================

    function test_ReceiveETH() public {
        uint256 balBefore = address(account).balance;
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool success,) = address(account).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(account).balance, balBefore + 1 ether);
    }

    // ==================== DailySpend tracking ====================

    function test_DailySpend_InitialValues() public view {
        SpendingPolicyLib.DailySpend memory ds = account.getDailySpend();
        assertEq(ds.amount, 0);
        // lastReset should be set at initialization time
        assertTrue(ds.lastReset > 0);
    }

    // ==================== Events ====================

    function test_SetTargetAllowed_EmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit AgentSmartAccount.TargetAllowedUpdated(blockedTarget, true);
        account.setTargetAllowed(blockedTarget, true);
    }

    function test_SetTokenAllowed_EmitsEvent() public {
        address token = makeAddr("token");
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit AgentSmartAccount.TokenAllowedUpdated(token, true);
        account.setTokenAllowed(token, true);
    }

    function test_Execute_EmitsEvent() public {
        address recipient = makeAddr("recipient");
        bytes memory data = abi.encodeWithSelector(usdc.transfer.selector, recipient, 10e6);

        vm.prank(ENTRY_POINT);
        vm.expectEmit(true, false, false, true);
        emit AgentSmartAccount.Executed(address(usdc), 0, data);
        account.execute(address(usdc), 0, data);
    }

    function test_ExecuteBatch_EmitsEvent() public {
        address[] memory dests = new address[](1);
        dests[0] = address(usdc);
        uint256[] memory values = new uint256[](1);
        bytes[] memory funcs = new bytes[](1);
        funcs[0] = abi.encodeWithSelector(usdc.transfer.selector, makeAddr("r"), 1e6);

        vm.prank(ENTRY_POINT);
        vm.expectEmit(false, false, false, true);
        emit AgentSmartAccount.BatchExecuted(1);
        account.executeBatch(dests, values, funcs);
    }
}
