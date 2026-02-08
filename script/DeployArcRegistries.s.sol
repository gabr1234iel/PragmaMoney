// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {IdentityRegistryUpgradeable} from "../src/ERC-8004/IdentityRegistry.sol";
import {ReputationRegistryUpgradeable} from "../src/ERC-8004/ReputationRegistry.sol";

/// @notice Deploys IdentityRegistryUpgradeable + ReputationRegistryUpgradeable behind ERC1967 proxies.
///         RPC: https://rpc.testnet.arc.network
///         Usage:
///           RPC_URL=https://rpc.testnet.arc.network PRIVATE_KEY=... \
///             forge script script/DeployArcRegistries.s.sol:DeployArcRegistries --rpc-url $RPC_URL --broadcast -vvvv
contract DeployArcRegistries is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // 1) Identity Registry (proxy)
        IdentityRegistryUpgradeable identityImpl = new IdentityRegistryUpgradeable();
        ERC1967Proxy identityProxy = new ERC1967Proxy(address(identityImpl), "");
        IdentityRegistryUpgradeable identity = IdentityRegistryUpgradeable(address(identityProxy));
        identity.initialize();

        // 2) Reputation Registry (proxy)
        ReputationRegistryUpgradeable reputationImpl = new ReputationRegistryUpgradeable();
        ERC1967Proxy reputationProxy = new ERC1967Proxy(address(reputationImpl), "");
        ReputationRegistryUpgradeable reputation = ReputationRegistryUpgradeable(address(reputationProxy));
        reputation.initialize(address(identity));

        vm.stopBroadcast();

        console2.log("deployer", deployer);
        console2.log("identityProxy", address(identity));
        console2.log("reputationProxy", address(reputation));
        console2.log("identityImpl", address(identityImpl));
        console2.log("reputationImpl", address(reputationImpl));
    }
}
