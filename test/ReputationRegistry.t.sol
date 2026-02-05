// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ReputationRegistryUpgradeable} from "../src/ERC-8004/ReputationRegistry.sol";
import {IdentityRegistryUpgradeable} from "../src/ERC-8004/IdentityRegistry.sol";
import {Errors} from "../src/errors/Errors.sol";
import {BaseTest} from "./BaseTest.t.sol";

contract ReputationRegistryTest is BaseTest {
    IdentityRegistryUpgradeable internal id;
    ReputationRegistryUpgradeable internal rep;

    function setUp() public {
        _startFork();
        vm.startPrank(deployer);
        id = _deployIdentity();
        rep = _deployReputation(address(id));
        vm.stopPrank();
    }

    /// @notice initialize sets identity registry
    function test_initialize_setsIdentityRegistry() public view {
        assertEq(rep.getIdentityRegistry(), address(id));
    }

    /// @notice self feedback (owner/operator) is blocked
    function test_giveFeedback_reverts_onSelfFeedback_ownerOrOperator() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(agentOwner);
        vm.expectRevert(bytes("Self-feedback not allowed"));
        rep.giveFeedback(agentId, 1, 0, "tag1", "tag2", "endpoint", "uri", bytes32("h"));

        vm.prank(agentOwner);
        id.setApprovalForAll(alice, true);

        vm.prank(alice);
        vm.expectRevert(bytes("Self-feedback not allowed"));
        rep.giveFeedback(agentId, 1, 0, "tag1", "tag2", "endpoint", "uri", bytes32("h"));
    }

    /// @notice feedback stored and index increments per client
    function test_giveFeedback_storesFeedback_andIncrementsIndex_perClient() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(alice);
        rep.giveFeedback(agentId, 10, 2, "t1", "t2", "endpoint", "uri1", bytes32("h1"));
        vm.prank(alice);
        rep.giveFeedback(agentId, -5, 2, "t1", "t2", "endpoint", "uri2", bytes32("h2"));

        assertEq(rep.getLastIndex(agentId, alice), 2);
        (int128 value, uint8 dec, string memory tag1, string memory tag2, bool revoked) =
            rep.readFeedback(agentId, alice, 2);
        assertEq(value, -5);
        assertEq(dec, 2);
        assertEq(tag1, "t1");
        assertEq(tag2, "t2");
        assertFalse(revoked);
    }

    /// @notice emits NewFeedback event
    function test_giveFeedback_emits_NewFeedback() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.expectEmit(true, true, true, true);
        emit ReputationRegistryUpgradeable.NewFeedback(
            agentId,
            alice,
            1,
            10,
            2,
            "tag1",
            "tag1",
            "tag2",
            "endpoint",
            "uri",
            bytes32("h")
        );

        vm.prank(alice);
        rep.giveFeedback(agentId, 10, 2, "tag1", "tag2", "endpoint", "uri", bytes32("h"));
    }

    /// @notice revoke marks feedback as revoked
    function test_revokeFeedback_marksRevoked_andEmits() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(alice);
        rep.giveFeedback(agentId, 10, 2, "tag1", "tag2", "endpoint", "uri", bytes32("h"));

        vm.expectEmit(true, true, true, true);
        emit ReputationRegistryUpgradeable.FeedbackRevoked(agentId, alice, 1);

        vm.prank(alice);
        rep.revokeFeedback(agentId, 1);

        (, , , , bool revoked) = rep.readFeedback(agentId, alice, 1);
        assertTrue(revoked);
    }

    /// @notice getSummary filters tags and requires clientAddresses
    function test_getSummary_filters_by_tag1_tag2_and_requires_clientAddresses() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(alice);
        rep.giveFeedback(agentId, 10, 2, "tagA", "tagX", "endpoint", "uri", bytes32("h1"));
        vm.prank(bob);
        rep.giveFeedback(agentId, 20, 2, "tagB", "tagY", "endpoint", "uri", bytes32("h2"));

        address[] memory clients = new address[](2);
        clients[0] = alice;
        clients[1] = bob;

        (uint64 count, int128 sum, ) = rep.getSummary(agentId, clients, "tagA", "tagX");
        assertEq(count, 1);
        assertEq(sum, 10);

        address[] memory empty;
        vm.expectRevert();
        rep.getSummary(agentId, empty, "", "");
    }

    /// @notice readAllFeedback includeRevoked toggle
    function test_readAllFeedback_includeRevoked_toggle() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(alice);
        rep.giveFeedback(agentId, 10, 2, "tag1", "tag2", "endpoint", "uri", bytes32("h1"));
        vm.prank(alice);
        rep.revokeFeedback(agentId, 1);

        address[] memory clients = new address[](1);
        clients[0] = alice;

        (address[] memory c1, uint64[] memory idx1, , , , , ) =
            rep.readAllFeedback(agentId, clients, "", "", false);
        assertEq(c1.length, 0);
        assertEq(idx1.length, 0);

        (address[] memory c2, uint64[] memory idx2, , , , , ) =
            rep.readAllFeedback(agentId, clients, "", "", true);
        assertEq(c2.length, 1);
        assertEq(idx2.length, 1);
    }

    /// @notice appendResponse tracks responder counts
    function test_appendResponse_tracksResponderCounts() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(alice);
        rep.giveFeedback(agentId, 10, 2, "tag1", "tag2", "endpoint", "uri", bytes32("h1"));

        vm.prank(validator1);
        rep.appendResponse(agentId, alice, 1, "resp1", bytes32("r1"));
        vm.prank(validator1);
        rep.appendResponse(agentId, alice, 1, "resp2", bytes32("r2"));

        address[] memory responders = new address[](1);
        responders[0] = validator1;
        uint64 count = rep.getResponseCount(agentId, alice, 1, responders);
        assertEq(count, 2);
    }
}
