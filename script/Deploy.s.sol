// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ServiceRegistry} from "../src/x402/ServiceRegistry.sol";
import {x402Gateway} from "../src/x402/x402Gateway.sol";
import {AgentSmartAccount} from "../src/Wallet/AgentSmartAccount.sol";
import {AgentAccountFactory} from "../src/Wallet/AgentAccountFactory.sol";
import {AgentFactory} from "../src/Launchpad/AgentFactory.sol";
import {ReputationReporter} from "../src/ERC-8004/ReputationReporter.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";

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

/// @title RedeployRegistryGateway
/// @notice Redeploys ServiceRegistry + x402Gateway with authorized recorder for proxy signer
contract RedeployRegistryGateway is Script {
    address constant MOCK_USDC = 0x00373f3dc69337e9f141d08a68026A63b88F3051;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address proxySigner = vm.envAddress("PROXY_SIGNER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new ServiceRegistry
        ServiceRegistry registry = new ServiceRegistry(deployer);

        // 2. Deploy new x402Gateway pointing to new registry
        x402Gateway gateway = new x402Gateway(address(registry), MOCK_USDC);

        // 3. Authorize gateway on registry
        registry.setGateway(address(gateway));

        // 4. Authorize proxy signer as recorder
        registry.setRecorder(proxySigner, true);

        vm.stopBroadcast();

        console2.log("New ServiceRegistry:", address(registry));
        console2.log("New x402Gateway:", address(gateway));
        console2.log("Proxy signer authorized:", proxySigner);
        console2.log("MockUSDC (unchanged):", MOCK_USDC);
    }
}

// forge script script/Deploy.s.sol:RedeployRegistryGateway --rpc-url base_sepolia --broadcast --verify -vvvv

/// @title DeployAgentFactory
/// @notice Deploys ReputationReporter (behind ERC1967Proxy) and AgentFactory on Base Sepolia
contract DeployAgentFactory is Script {
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        address deployer = vm.addr(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // 1. Deploy ReputationReporter implementation
        ReputationReporter reporterImpl = new ReputationReporter();

        // 2. Deploy ERC1967Proxy pointing to implementation with initializer
        bytes memory initData = abi.encodeCall(
            ReputationReporter.initialize,
            (deployer, deployer, REPUTATION_REGISTRY, IDENTITY_REGISTRY)
        );
        ERC1967Proxy reporterProxy = new ERC1967Proxy(address(reporterImpl), initData);

        // 3. Deploy AgentFactory
        AgentFactory factory = new AgentFactory(
            IIdentityRegistry(IDENTITY_REGISTRY),
            deployer,   // owner
            deployer,   // admin
            deployer,   // scoreOracle placeholder
            address(reporterProxy) // reputationReporter
        );

        // 4. Set AgentFactory as admin on ReputationReporter
        ReputationReporter(address(reporterProxy)).setAdmin(address(factory));

        vm.stopBroadcast();

        console2.log("ReputationReporter (impl):", address(reporterImpl));
        console2.log("ReputationReporter (proxy):", address(reporterProxy));
        console2.log("AgentFactory:", address(factory));
    }
}

// forge script script/Deploy.s.sol:DeployAgentFactory --rpc-url base_sepolia --broadcast --verify -vvvv

/// @title RedeployGatewayRealUSDC
/// @notice Redeploys ServiceRegistry + x402Gateway using real Base Sepolia USDC
/// @dev Fixes token mismatch: old gateway used MockUSDC, this uses real USDC (0x036CbD...)
///      so both x402 facilitator path and gateway path use the same token.
contract RedeployGatewayRealUSDC is Script {
    // Real USDC on Base Sepolia (EIP-3009 compatible, used by x402 facilitator)
    address constant REAL_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address proxySigner = vm.envAddress("PROXY_SIGNER_ADDRESS");

        console2.log("Deployer:", deployer);
        console2.log("Proxy signer:", proxySigner);
        console2.log("USDC (real):", REAL_USDC);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new ServiceRegistry
        ServiceRegistry registry = new ServiceRegistry(deployer);

        // 2. Deploy new x402Gateway pointing to new registry, using REAL USDC
        x402Gateway gateway = new x402Gateway(address(registry), REAL_USDC);

        // 3. Authorize gateway on registry
        registry.setGateway(address(gateway));

        // 4. Authorize proxy signer as recorder (for x402 Path A usage tracking)
        registry.setRecorder(proxySigner, true);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Redeployment Summary (Real USDC) ===");
        console2.log("ServiceRegistry:", address(registry));
        console2.log("x402Gateway:", address(gateway));
        console2.log("USDC:", REAL_USDC);
        console2.log("Proxy signer authorized:", proxySigner);
    }
}

// forge script script/Deploy.s.sol:RedeployGatewayRealUSDC --rpc-url base_sepolia --broadcast --verify -vvvv