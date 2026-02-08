// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {AgentSmartAccount} from "../src/Wallet/AgentSmartAccount.sol";
import {AgentAccountFactory} from "../src/Wallet/AgentAccountFactory.sol";
import {IAgentAccountFactory} from "../src/Wallet/interfaces/IAgentAccountFactory.sol";
import {SpendingPolicyLib} from "../src/Wallet/SpendingPolicyLib.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AgentAccountFactoryTest is Test {
    AgentSmartAccount public implementation;
    AgentAccountFactory public factory;

    address public constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address public owner = makeAddr("owner");
    address public operator = makeAddr("operator");
    address public stranger = makeAddr("stranger");

    bytes32 public constant AGENT_ID_1 = keccak256("agent-1");
    bytes32 public constant AGENT_ID_2 = keccak256("agent-2");
    uint256 public constant DAILY_LIMIT = 1000e6;
    uint256 public expiresAt;

    function setUp() public {
        expiresAt = block.timestamp + 30 days;

        implementation = new AgentSmartAccount();
        factory = new AgentAccountFactory(address(implementation), ENTRY_POINT);

        vm.label(address(implementation), "Implementation");
        vm.label(address(factory), "Factory");
    }

    // ==================== Constructor ====================

    function test_Constructor_SetsImmutables() public view {
        assertEq(factory.implementation(), address(implementation));
        assertEq(address(factory.entryPoint()), ENTRY_POINT);
    }

    function test_Constructor_RevertZeroImplementation() public {
        vm.expectRevert(IAgentAccountFactory.ZeroAddress.selector);
        new AgentAccountFactory(address(0), ENTRY_POINT);
    }

    function test_Constructor_RevertZeroEntryPoint() public {
        vm.expectRevert(IAgentAccountFactory.ZeroAddress.selector);
        new AgentAccountFactory(address(implementation), address(0));
    }

    // ==================== createAccount ====================

    function test_CreateAccount_DeploysAndInitializes() public {
        address account = factory.createAccount(owner, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);

        assertTrue(account != address(0));
        assertTrue(account.code.length > 0);

        AgentSmartAccount acct = AgentSmartAccount(payable(account));
        assertEq(acct.owner(), owner);
        assertEq(acct.operator(), operator);
        assertEq(acct.agentId(), AGENT_ID_1);

        SpendingPolicyLib.Policy memory pol = acct.getPolicy();
        assertEq(pol.dailyLimit, DAILY_LIMIT);
        assertEq(pol.expiresAt, expiresAt);
    }

    function test_CreateAccount_EmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        // We need to predict the address for the event assertion
        address predicted = factory.getAddress(owner, AGENT_ID_1);
        emit IAgentAccountFactory.AccountCreated(predicted, owner, operator, AGENT_ID_1);

        factory.createAccount(owner, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);
    }

    function test_CreateAccount_DuplicateReverts() public {
        factory.createAccount(owner, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);

        vm.expectRevert(); // ERC1167FailedCreateClone
        factory.createAccount(owner, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);
    }

    function test_CreateAccount_DifferentAgentIds() public {
        address account1 = factory.createAccount(owner, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);
        address account2 = factory.createAccount(owner, operator, AGENT_ID_2, DAILY_LIMIT, expiresAt);

        assertTrue(account1 != account2);

        assertEq(AgentSmartAccount(payable(account1)).agentId(), AGENT_ID_1);
        assertEq(AgentSmartAccount(payable(account2)).agentId(), AGENT_ID_2);
    }

    function test_CreateAccount_DifferentOwnersSameAgentId() public {
        address owner2 = makeAddr("owner2");

        address account1 = factory.createAccount(owner, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);
        address account2 = factory.createAccount(owner2, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);

        assertTrue(account1 != account2);
    }

    // ==================== getAddress ====================

    function test_GetAddress_PredictCorrectly() public {
        address predicted = factory.getAddress(owner, AGENT_ID_1);
        address actual = factory.createAccount(owner, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);
        assertEq(predicted, actual);
    }

    function test_GetAddress_DeterministicAcrossCalls() public view {
        address predicted1 = factory.getAddress(owner, AGENT_ID_1);
        address predicted2 = factory.getAddress(owner, AGENT_ID_1);
        assertEq(predicted1, predicted2);
    }

    function test_GetAddress_DifferentInputsDifferentAddresses() public view {
        address addr1 = factory.getAddress(owner, AGENT_ID_1);
        address addr2 = factory.getAddress(owner, AGENT_ID_2);
        assertTrue(addr1 != addr2);
    }

    // ==================== Fuzz tests ====================

    function testFuzz_CreateAccount_VariousParams(
        address _owner,
        address _operator,
        bytes32 _agentId,
        uint256 _dailyLimit,
        uint256 _expiresAt
    ) public {
        // Skip precompile addresses and zero address
        vm.assume(_owner != address(0));
        vm.assume(_operator != address(0));
        vm.assume(uint160(_owner) > 10);
        vm.assume(uint160(_operator) > 10);
        vm.assume(_expiresAt > block.timestamp);

        address predicted = factory.getAddress(_owner, _agentId);
        address actual = factory.createAccount(_owner, _operator, _agentId, _dailyLimit, _expiresAt);

        assertEq(predicted, actual);

        AgentSmartAccount acct = AgentSmartAccount(payable(actual));
        assertEq(acct.owner(), _owner);
        assertEq(acct.operator(), _operator);
        assertEq(acct.agentId(), _agentId);
    }

    // ==================== Trusted Contracts ====================

    function test_TrustedContract_InitiallyFalse() public {
        address target = makeAddr("target");
        assertFalse(factory.isTrustedContract(target));
    }

    function test_TrustedContract_OwnerCanSet() public {
        address target = makeAddr("target");

        factory.setTrustedContract(target, true);
        assertTrue(factory.isTrustedContract(target));

        factory.setTrustedContract(target, false);
        assertFalse(factory.isTrustedContract(target));
    }

    function test_TrustedContract_StrangerCannotSet() public {
        address target = makeAddr("target");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.setTrustedContract(target, true);
    }

    function test_TrustedContract_EmitsEvent() public {
        address target = makeAddr("target");

        vm.expectEmit(true, false, false, true);
        emit IAgentAccountFactory.TrustedContractSet(target, true);
        factory.setTrustedContract(target, true);
    }

    // ==================== Trusted Tokens ====================

    function test_TrustedToken_InitiallyFalse() public {
        address token = makeAddr("token");
        assertFalse(factory.isTrustedToken(token));
    }

    function test_TrustedToken_OwnerCanSet() public {
        address token = makeAddr("token");

        factory.setTrustedToken(token, true);
        assertTrue(factory.isTrustedToken(token));

        factory.setTrustedToken(token, false);
        assertFalse(factory.isTrustedToken(token));
    }

    function test_TrustedToken_StrangerCannotSet() public {
        address token = makeAddr("token");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.setTrustedToken(token, true);
    }

    function test_TrustedToken_EmitsEvent() public {
        address token = makeAddr("token");

        vm.expectEmit(true, false, false, true);
        emit IAgentAccountFactory.TrustedTokenSet(token, true);
        factory.setTrustedToken(token, true);
    }

    // ==================== Ownership ====================

    function test_Owner_IsDeployer() public view {
        assertEq(factory.owner(), address(this));
    }
}
