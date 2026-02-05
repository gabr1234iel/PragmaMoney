// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ReputationReporter} from "../src/ERC-8004/ReputationReporter.sol";
import {ScoreOracle} from "../src/ERC-8004/ScoreOracle.sol";
import {AgentFactory} from "../src/Launchpad/AgentFactory.sol";
import {IAgentFactory} from "../src/interfaces/IAgentFactory.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../src/interfaces/IReputationRegistry.sol";

/// @notice Deploys ReputationReporter (proxy), AgentFactory, and ScoreOracle on Base Sepolia.
///         Uses Base Sepolia IdentityRegistry and ReputationRegistry proxy addresses by default.
contract DeployContracts is Script {
    address internal constant BASE_SEPOLIA_IDENTITY =
        0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address internal constant BASE_SEPOLIA_REPUTATION =
        0x8004B663056A597Dffe9eCcC1965A193B7388713;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address identityAddr = vm.envOr("IDENTITY_REGISTRY", BASE_SEPOLIA_IDENTITY);
        address reputationAddr = vm.envOr("REPUTATION_REGISTRY", BASE_SEPOLIA_REPUTATION);

        vm.startBroadcast(pk);

        // 1) Reporter (upgradeable via ERC1967Proxy)
        ReputationReporter impl = new ReputationReporter();
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), "");
        ReputationReporter reporter = ReputationReporter(address(proxy));
        reporter.initialize(deployer, deployer, reputationAddr, identityAddr);

        // 2) Factory (use deployer as temporary scoreOracle to satisfy constructor)
        AgentFactory factory = new AgentFactory(
            IIdentityRegistry(identityAddr),
            deployer,
            deployer,
            deployer,
            address(reporter)
        );

        // 3) ScoreOracle (real)
        ScoreOracle oracle = new ScoreOracle(
            IReputationRegistry(reputationAddr),
            IAgentFactory(address(factory)),
            address(reporter),
            deployer,
            deployer
        );

        // Wire oracle into factory and reporter
        factory.setScoreOracle(address(oracle));
        reporter.setAdmin(address(factory));

        vm.stopBroadcast();

        console2.log("deployer", deployer);
        console2.log("identity", identityAddr);
        console2.log("reputation", reputationAddr);
        console2.log("reporter", address(reporter));
        console2.log("factory", address(factory));
        console2.log("oracle", address(oracle));
    }
}
