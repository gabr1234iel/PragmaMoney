// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {BaseTest} from "./BaseTest.t.sol";
import {ScoreOracle} from "../src/ERC-8004/ScoreOracle.sol";
import {AgentPool} from "../src/Launchpad/AgentPool.sol";
import {AgentFactory} from "../src/Launchpad/AgentFactory.sol";
import {ReputationReporter} from "../src/ERC-8004/ReputationReporter.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {IAgentFactory} from "../src/interfaces/IAgentFactory.sol";
import {IReputationRegistry} from "../src/interfaces/IReputationRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ScoreOracleTest is BaseTest {
    IIdentityRegistry internal id;
    IReputationRegistry internal rep;
    ReputationReporter internal reporter;
    AgentFactory internal factory;
    AgentPool internal pool;
    ScoreOracle internal oracle;

    function setUp() public {
        _startFork();
        _setupUsdc();

        vm.startPrank(deployer);
        id = _deployIdentity();
        rep = _deployReputation(address(id));
        reporter = _deployReporter(address(rep), address(id));
        factory = new AgentFactory(IIdentityRegistry(address(id)), deployer, deployer, deployer, address(reporter));
        reporter.setAdmin(address(factory));
        vm.stopPrank();
    }

    /// @notice integration: feedback -> score -> daily cap update
    function test_scoreOracle_updates_dailyCap() public {
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");

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

        vm.prank(deployer);
        address poolAddr = factory.createAgentPool(agentId, agentOwner, p);
        pool = AgentPool(poolAddr);

        console2.log("pool", poolAddr);
        console2.log("cap before", pool.dailyCap());

        // Validators provide feedback directly to registry (open).
        vm.prank(deployer);
        reporter.setReporter(validator1, true);
        vm.prank(deployer);
        reporter.setReporter(validator2, true);

        vm.prank(validator1);
        reporter.giveFeedback(agentId, 9925, 2, "payment", "successRate", "endpoint", "uri1", bytes32("h1")); // 99.25
        vm.prank(validator1);
        reporter.giveFeedback(agentId, 991, 1, "payment", "successRate", "endpoint", "uri2", bytes32("h2")); // 99.1
        vm.prank(validator2);
        reporter.giveFeedback(agentId, 9925, 2, "uptime", "", "endpoint", "uri3", bytes32("h3")); // 99.25
        vm.prank(validator2);
        reporter.giveFeedback(agentId, 120, 0, "latency", "ms", "endpoint", "uri4", bytes32("h4")); // 120ms

        string[] memory tag1s = new string[](3);
        string[] memory tag2s = new string[](3);
        tag1s[0] = "payment";
        tag2s[0] = "successRate";
        tag1s[1] = "uptime";
        tag2s[1] = "";
        tag1s[2] = "latency";
        tag2s[2] = "ms";

        // Deploy oracle with factory address.
        vm.prank(deployer);
        oracle = new ScoreOracle(
            IReputationRegistry(address(rep)),
            IAgentFactory(address(factory)),
            address(reporter),
            deployer,
            deployer
        );

        // Update pool oracle so ScoreOracle can set caps.
        vm.prank(deployer);
        pool.setScoreOracle(address(oracle));

        console2.log("oracle", address(oracle));

        // First call sets baseline only (no cap change)
        int32[] memory weights = new int32[](3);
        weights[0] = 10_000;  // payment success higher is better (1.0x)
        weights[1] = 10_000;  // uptime higher is better (1.0x)
        weights[2] = -1_000;  // latency lower is better (0.1x)

        vm.prank(deployer);
        oracle.calculateScore(agentId, tag1s, tag2s, weights);
        uint256 capAfterFirst = pool.dailyCap();
        console2.log("cap after first", capAfterFirst);
        assertEq(capAfterFirst, 100e6);

        // Second epoch: add more feedback to change score
        vm.prank(validator1);
        reporter.giveFeedback(agentId, 980, 1, "payment", "successRate", "endpoint", "uri5", bytes32("h5")); // 98.0
        vm.prank(validator2);
        reporter.giveFeedback(agentId, 9800, 2, "uptime", "", "endpoint", "uri6", bytes32("h6")); // 98.00
        vm.prank(validator2);
        reporter.giveFeedback(agentId, 200, 0, "latency", "ms", "endpoint", "uri7", bytes32("h7")); // 200ms

        vm.prank(deployer);
        oracle.calculateScore(agentId, tag1s, tag2s, weights);

        uint256 capAfterSecond = pool.dailyCap();
        console2.log("cap after second", capAfterSecond);
        assertTrue(capAfterSecond != capAfterFirst);
    }
}
