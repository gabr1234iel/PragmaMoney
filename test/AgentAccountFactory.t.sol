// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {AgentSmartAccount} from "../src/Wallet/AgentSmartAccount.sol";
import {AgentAccountFactory} from "../src/Wallet/AgentAccountFactory.sol";
import {SpendingPolicyLib} from "../src/Wallet/SpendingPolicyLib.sol";

contract AgentAccountFactoryTest is Test {
    AgentSmartAccount public implementation;
    AgentAccountFactory public factory;

    address public constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    bytes32 public constant ACTIONS_ROOT = keccak256("default-actions-root");

    address public owner = makeAddr("owner");
    address public admin = makeAddr("admin");
    address public operator = makeAddr("operator");

    bytes32 public constant AGENT_ID_1 = keccak256("agent-1");
    bytes32 public constant AGENT_ID_2 = keccak256("agent-2");
    uint256 public constant DAILY_LIMIT = 1000e6;
    uint256 public expiresAt;

    function setUp() public {
        expiresAt = block.timestamp + 30 days;

        implementation = new AgentSmartAccount();
        factory = new AgentAccountFactory(address(implementation), ENTRY_POINT, ACTIONS_ROOT);

        vm.label(address(implementation), "Implementation");
        vm.label(address(factory), "Factory");
    }

    // ==================== Constructor ====================

    function test_Constructor_SetsImmutables() public view {
        assertEq(factory.implementation(), address(implementation));
        assertEq(address(factory.entryPoint()), ENTRY_POINT);
        assertEq(factory.defaultActionsRoot(), ACTIONS_ROOT);
    }

    function test_Constructor_RevertZeroImplementation() public {
        vm.expectRevert(AgentAccountFactory.ZeroAddress.selector);
        new AgentAccountFactory(address(0), ENTRY_POINT, ACTIONS_ROOT);
    }

    function test_Constructor_RevertZeroEntryPoint() public {
        vm.expectRevert(AgentAccountFactory.ZeroAddress.selector);
        new AgentAccountFactory(address(implementation), address(0), ACTIONS_ROOT);
    }

    // ==================== createAccount ====================

    function test_CreateAccount_DeploysAndInitializes() public {
        address account = factory.createAccount(
            owner, admin, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt
        );

        assertTrue(account != address(0));
        assertTrue(account.code.length > 0);

        AgentSmartAccount acct = AgentSmartAccount(payable(account));
        assertEq(acct.owner(), owner);
        assertEq(acct.admin(), admin);
        assertEq(acct.operator(), operator);
        assertEq(acct.agentId(), AGENT_ID_1);
        assertEq(acct.getActionsRoot(), ACTIONS_ROOT);

        SpendingPolicyLib.Policy memory pol = acct.getPolicy();
        assertEq(pol.dailyLimit, DAILY_LIMIT);
        assertEq(pol.expiresAt, expiresAt);
    }

    function test_CreateAccount_EmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        // We need to predict the address for the event assertion
        address predicted = factory.getAddress(owner, AGENT_ID_1);
        emit AgentAccountFactory.AccountCreated(predicted, owner, operator, AGENT_ID_1);

        factory.createAccount(owner, admin, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);
    }

    function test_CreateAccount_DuplicateReverts() public {
        factory.createAccount(owner, admin, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);

        vm.expectRevert(); // ERC1167FailedCreateClone
        factory.createAccount(owner, admin, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt);
    }

    function test_CreateAccount_DifferentAgentIds() public {
        address account1 = factory.createAccount(
            owner, admin, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt
        );
        address account2 = factory.createAccount(
            owner, admin, operator, AGENT_ID_2, DAILY_LIMIT, expiresAt
        );

        assertTrue(account1 != account2);

        assertEq(AgentSmartAccount(payable(account1)).agentId(), AGENT_ID_1);
        assertEq(AgentSmartAccount(payable(account2)).agentId(), AGENT_ID_2);
    }

    function test_CreateAccount_DifferentOwnersSameAgentId() public {
        address owner2 = makeAddr("owner2");

        address account1 = factory.createAccount(
            owner, admin, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt
        );
        address account2 = factory.createAccount(
            owner2, admin, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt
        );

        assertTrue(account1 != account2);
    }

    // ==================== getAddress ====================

    function test_GetAddress_PredictCorrectly() public {
        address predicted = factory.getAddress(owner, AGENT_ID_1);
        address actual = factory.createAccount(
            owner, admin, operator, AGENT_ID_1, DAILY_LIMIT, expiresAt
        );
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
        address _admin,
        address _operator,
        bytes32 _agentId,
        uint256 _dailyLimit,
        uint256 _expiresAt
    ) public {
        // Skip precompile addresses and zero address
        vm.assume(_owner != address(0));
        vm.assume(_admin != address(0));
        vm.assume(_operator != address(0));
        vm.assume(uint160(_owner) > 10);
        vm.assume(uint160(_admin) > 10);
        vm.assume(uint160(_operator) > 10);
        vm.assume(_expiresAt > block.timestamp);

        address predicted = factory.getAddress(_owner, _agentId);
        address actual = factory.createAccount(
            _owner, _admin, _operator, _agentId, _dailyLimit, _expiresAt
        );

        assertEq(predicted, actual);

        AgentSmartAccount acct = AgentSmartAccount(payable(actual));
        assertEq(acct.owner(), _owner);
        assertEq(acct.admin(), _admin);
        assertEq(acct.operator(), _operator);
        assertEq(acct.agentId(), _agentId);
    }
}
