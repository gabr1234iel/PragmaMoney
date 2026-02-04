// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ServiceRegistry} from "../src/x402/ServiceRegistry.sol";
import {x402Gateway} from "../src/x402/x402Gateway.sol";
import {AgentSmartAccount} from "../src/Wallet/AgentSmartAccount.sol";
import {AgentAccountFactory} from "../src/Wallet/AgentAccountFactory.sol";

/// @title Deploy
/// @notice Deployment script for PragmaMoney contracts on Base Sepolia
/// @dev Deploys MockUSDC, mints tokens, and deploys all PragmaMoney contracts
contract Deploy is Script {
    // Base Sepolia USDC (use MockUSDC if deploying mock, otherwise use real USDC)
    address public USDC;

    // Canonical ERC-4337 v0.7 EntryPoint
    address constant ENTRY_POINT = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    // Amount to mint to deployer (1000 USDC = 1000 * 10^6 = 1000000000)
    uint256 constant MINT_AMOUNT = 1000 * 10**6;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 0. Deploy MockUSDC and mint tokens to deployer
        MockUSDC mockUSDC = new MockUSDC();
        mockUSDC.mint(deployer, MINT_AMOUNT);
        USDC = address(mockUSDC);
        console2.log("MockUSDC deployed at:", USDC);
        console2.log("Minted", MINT_AMOUNT / 10**6, "USDC to deployer");
        console2.log("Deployer balance:", mockUSDC.balanceOf(deployer) / 10**6, "USDC");

        // 1. Deploy ServiceRegistry (deployer is the initial owner)
        ServiceRegistry registry = new ServiceRegistry(deployer);
        console2.log("ServiceRegistry deployed at:", address(registry));

        // 2. Deploy x402Gateway
        x402Gateway gateway = new x402Gateway(address(registry), USDC);
        console2.log("x402Gateway deployed at:", address(gateway));

        // 3. Set gateway as authorized caller on ServiceRegistry
        registry.setGateway(address(gateway));
        console2.log("Gateway authorized on ServiceRegistry");

        // 4. Deploy AgentSmartAccount implementation (logic contract)
        AgentSmartAccount accountImpl = new AgentSmartAccount();
        console2.log("AgentSmartAccount implementation deployed at:", address(accountImpl));

        // 5. Deploy AgentAccountFactory
        AgentAccountFactory factory = new AgentAccountFactory(
            address(accountImpl),
            ENTRY_POINT
        );
        console2.log("AgentAccountFactory deployed at:", address(factory));

        vm.stopBroadcast();

        // Summary
        console2.log("");
        console2.log("=== Deployment Summary ===");
        console2.log("MockUSDC:                 ", USDC);
        console2.log("ServiceRegistry:           ", address(registry));
        console2.log("x402Gateway:               ", address(gateway));
        console2.log("AgentSmartAccount (impl):  ", address(accountImpl));
        console2.log("AgentAccountFactory:       ", address(factory));
        console2.log("EntryPoint:                ", ENTRY_POINT);
        console2.log("");
        console2.log("Deployer USDC balance:     ", mockUSDC.balanceOf(deployer) / 10**6, "USDC");
    }
}

// forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast --verify -vvvv