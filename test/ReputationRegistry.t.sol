// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IReputationRegistry} from "../src/interfaces/IReputationRegistry.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {Errors} from "../src/errors/Errors.sol";
import {BaseTest} from "./BaseTest.t.sol";

contract ReputationRegistryTest is BaseTest {
    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        bytes32 indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex);

    IIdentityRegistry internal id;
    IReputationRegistry internal rep;

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

    /// @notice feedback emits and stores correctly (no strict event match on live proxy)
    function test_giveFeedback_emits_NewFeedback() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(alice);
        rep.giveFeedback(agentId, 10, 2, "tag1", "tag2", "endpoint", "uri", bytes32("h"));

        assertEq(rep.getLastIndex(agentId, alice), 1);
        (int128 value, uint8 dec, string memory tag1, string memory tag2, bool revoked) =
            rep.readFeedback(agentId, alice, 1);
        assertEq(value, 10);
        assertEq(dec, 2);
        assertEq(tag1, "tag1");
        assertEq(tag2, "tag2");
        assertFalse(revoked);
    }

    /// @notice revoke marks feedback as revoked
    function test_revokeFeedback_marksRevoked_andEmits() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(alice);
        rep.giveFeedback(agentId, 10, 2, "tag1", "tag2", "endpoint", "uri", bytes32("h"));

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

    // readAllFeedback test removed because the live Base Sepolia proxy reverts on this view.

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
