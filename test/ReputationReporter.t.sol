// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ReputationReporter} from "../src/ERC-8004/ReputationReporter.sol";
import {ReputationRegistryUpgradeable} from "../src/ERC-8004/ReputationRegistry.sol";
import {IdentityRegistryUpgradeable} from "../src/ERC-8004/IdentityRegistry.sol";
import {Errors} from "../src/errors/Errors.sol";
import {BaseTest} from "./BaseTest.t.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract ReputationReporterTest is BaseTest {
    IdentityRegistryUpgradeable internal id;
    ReputationRegistryUpgradeable internal rep;
    ReputationReporter internal reporter;

    function setUp() public {
        _startFork();
        vm.startPrank(deployer);
        id = _deployIdentity();
        rep = _deployReputation(address(id));
        reporter = _deployReporter(address(rep), address(id));
        vm.stopPrank();
    }

    /// @notice only reporters can forward feedback
    function test_onlyReporter_canGiveFeedback() public {
        vm.prank(deployer);
        reporter.setReporter(validator1, true);

        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(validator1);
        reporter.giveFeedback(agentId, 10, 2, "tag1", "tag2", "endpoint", "uri", bytes32("h"));

        vm.prank(validator2);
        vm.expectRevert(Errors.NotValidator.selector);
        reporter.giveFeedback(agentId, 10, 2, "tag1", "tag2", "endpoint", "uri", bytes32("h"));
    }

    /// @notice setReporter requires auth
    function test_setReporter_requiresAuth() public {
        vm.prank(alice);
        vm.expectRevert(Errors.NotAuthorized.selector);
        reporter.setReporter(validator1, true);
    }

    /// @notice setReputationRegistry requires auth and updates
    function test_setReputationRegistry_requiresAuth_and_updates() public {
        vm.startPrank(deployer);
        ReputationRegistryUpgradeable rep2 = _deployReputation(address(id));
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(Errors.NotAuthorized.selector);
        reporter.setReputationRegistry(address(rep2));

        vm.startPrank(deployer);
        reporter.setReputationRegistry(address(rep2));
        vm.stopPrank();
    }

    /// @notice end-to-end reporter -> registry
    function test_integration_reporter_to_registry_endToEnd() public {
        vm.prank(deployer);
        reporter.setReporter(validator1, true);

        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(validator1);
        reporter.giveFeedback(agentId, 10, 2, "tag1", "tag2", "endpoint", "uri", bytes32("h"));

        (int128 value, , , , ) = rep.readFeedback(agentId, address(reporter), 1);
        assertEq(value, 10);
    }
}
