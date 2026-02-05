// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgentFactory} from "../src/Launchpad/AgentFactory.sol";
import {IIdentityRegistry as FactoryIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {AgentPool} from "../src/Launchpad/AgentPool.sol";
import {IdentityRegistryUpgradeable} from "../src/ERC-8004/IdentityRegistry.sol";
import {ReputationRegistryUpgradeable} from "../src/ERC-8004/ReputationRegistry.sol";
import {ReputationReporter} from "../src/ERC-8004/ReputationReporter.sol";
import {Errors} from "../src/errors/Errors.sol";
import {BaseTest} from "./BaseTest.t.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Vm} from "forge-std/Vm.sol";

contract AgentFactoryTest is BaseTest {
    IdentityRegistryUpgradeable internal id;
    AgentFactory internal factory;
    ReputationReporter internal reporter;

    function setUp() public {
        _startFork();
        _setupUsdc();
        vm.startPrank(deployer);
        id = _deployIdentity();
        ReputationRegistryUpgradeable rep = _deployReputation(address(id));
        reporter = _deployReporter(address(rep), address(id));
        factory = new AgentFactory(FactoryIdentityRegistry(address(id)), deployer, deployer, deployer, address(reporter));
        reporter.setAdmin(address(factory));
        vm.stopPrank();
    }

    function test_createAgent_deploysPool_for_registered_identity() public {
        AgentFactory.CreateParams memory p = AgentFactory.CreateParams({
            agentURI: "file://metadata/agent-1.json",
            asset: IERC20(address(usdc)),
            name: "Agent Pool",
            symbol: "APOOL",
            poolOwner: deployer,
            dailyCap: 100e6,
            vestingDuration: 7 days,
            metadataURI: "file://metadata/agent-1.json"
        });

        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(deployer);
        address poolAddr = factory.createAgentPool(agentId, agentOwner, p);

        assertEq(id.ownerOf(agentId), agentOwner);
        assertTrue(poolAddr != address(0));

        AgentPool pool = AgentPool(poolAddr);
        assertEq(address(pool.asset()), address(usdc));
    }

    function test_onlyAuthorized_can_create_agent_pool() public {
        AgentFactory.CreateParams memory p = AgentFactory.CreateParams({
            agentURI: "file://metadata/agent-1.json",
            asset: IERC20(address(usdc)),
            name: "Agent Pool",
            symbol: "APOOL",
            poolOwner: deployer,
            dailyCap: 100e6,
            vestingDuration: 7 days,
            metadataURI: "file://metadata/agent-1.json"
        });

        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(alice);
        vm.expectRevert(Errors.NotAuthorized.selector);
        factory.createAgentPool(agentId, agentOwner, p);

        vm.prank(deployer);
        address poolAddr = factory.createAgentPool(agentId, agentOwner, p);
        assertEq(id.ownerOf(agentId), agentOwner);
        assertTrue(poolAddr != address(0));
    }

    function test_createAgent_emits_events() public {
        AgentFactory.CreateParams memory p = AgentFactory.CreateParams({
            agentURI: "file://metadata/agent-1.json",
            asset: IERC20(address(usdc)),
            name: "Agent Pool",
            symbol: "APOOL",
            poolOwner: deployer,
            dailyCap: 100e6,
            vestingDuration: 7 days,
            metadataURI: "file://metadata/agent-1.json"
        });

        vm.recordLogs();
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(deployer);
        factory.createAgentPool(agentId, agentOwner, p);

        Vm.Log[] memory entries = vm.getRecordedLogs();
        bytes32 sig = keccak256("AgentPoolCreated(address,uint256,address)");
        bool found;
        for (uint256 i; i < entries.length; i++) {
            if (entries[i].topics.length > 0 && entries[i].topics[0] == sig) {
                found = true;
                break;
            }
        }
        assertTrue(found);
    }

    function test_multipleAgents_have_isolatedPools() public {
        AgentFactory.CreateParams memory p1 = AgentFactory.CreateParams({
            agentURI: "file://metadata/agent-1.json",
            asset: IERC20(address(usdc)),
            name: "Agent Pool 1",
            symbol: "AP1",
            poolOwner: deployer,
            dailyCap: 100e6,
            vestingDuration: 7 days,
            metadataURI: "file://metadata/agent-1.json"
        });

        AgentFactory.CreateParams memory p2 = AgentFactory.CreateParams({
            agentURI: "file://metadata/agent-2.json",
            asset: IERC20(address(usdc)),
            name: "Agent Pool 2",
            symbol: "AP2",
            poolOwner: deployer,
            dailyCap: 50e6,
            vestingDuration: 1 days,
            metadataURI: "file://metadata/agent-2.json"
        });

        vm.prank(agentOwner);
        uint256 agentId1 = id.register("file://metadata/agent-1.json");
        vm.prank(bob);
        uint256 agentId2 = id.register("file://metadata/agent-2.json");

        vm.prank(deployer);
        address pool1 = factory.createAgentPool(agentId1, agentOwner, p1);
        vm.prank(deployer);
        address pool2 = factory.createAgentPool(agentId2, bob, p2);

        assertTrue(pool1 != pool2);
    }

    /// @notice getPoolsByAgentId returns pools created for the agentId
    function test_getPoolsByAgentId_returnsCreatedPools() public {
        AgentFactory.CreateParams memory p = AgentFactory.CreateParams({
            agentURI: "file://metadata/agent-1.json",
            asset: IERC20(address(usdc)),
            name: "Agent Pool",
            symbol: "APOOL",
            poolOwner: deployer,
            dailyCap: 100e6,
            vestingDuration: 7 days,
            metadataURI: "file://metadata/agent-1.json"
        });

        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

        vm.prank(deployer);
        address pool1 = factory.createAgentPool(agentId, agentOwner, p);

        address[] memory pools = factory.getPoolsByAgentId(agentId);
        assertEq(pools.length, 1);
        assertEq(pools[0], pool1);
    }
}
