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
import {IAgentFactory} from "../src/interfaces/IAgentFactory.sol";
import {ScoreOracle} from "../src/ERC-8004/ScoreOracle.sol";
import {IReputationRegistry} from "../src/interfaces/IReputationRegistry.sol";

/// @title Deploy
/// @notice Deployment script for PragmaMoney contracts on Base Sepolia
/// @dev Deploys MockUSDC, mints tokens, and deploys all PragmaMoney contracts
contract Deploy is Script {
    // Base Sepolia USDC (use MockUSDC if deploying mock, otherwise use real USDC)
    address public USDC;

    // Canonical ERC-4337 v0.7 EntryPoint
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

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
        address identityRegistry = vm.envAddress("IDENTITY_REGISTRY_ADDRESS");
        address agentFactory = vm.envAddress("AGENT_FACTORY_ADDRESS");
        ServiceRegistry registry = new ServiceRegistry(deployer, identityRegistry, agentFactory);
        console2.log("ServiceRegistry deployed at:", address(registry));

        // 2. Deploy x402Gateway (requires IdentityRegistry + AgentFactory addresses)
        x402Gateway gateway = new x402Gateway(address(registry), USDC, identityRegistry, agentFactory);
        console2.log("x402Gateway deployed at:", address(gateway));

        // 3. Set gateway as authorized caller on ServiceRegistry
        registry.setGateway(address(gateway));
        console2.log("Gateway authorized on ServiceRegistry");

        // 4. Deploy AgentSmartAccount implementation (logic contract)
        AgentSmartAccount accountImpl = new AgentSmartAccount();
        console2.log("AgentSmartAccount implementation deployed at:", address(accountImpl));

        // 5. Deploy AgentAccountFactory (SpendingPolicy-only, no Merkle root)
        AgentAccountFactory factory = new AgentAccountFactory(address(accountImpl), ENTRY_POINT);
        console2.log("AgentAccountFactory deployed at:", address(factory));


        vm.stopBroadcast();

        // Summary
        console2.log("");
        console2.log("=== Deployment Summary ===");
        console2.log("MockUSDC:                 ", USDC);
        console2.log("ServiceRegistry:           ", address(registry));
        console2.log("x402Gateway:               ", address(gateway));
        console2.log("IdentityRegistry:          ", identityRegistry);
        console2.log("AgentFactory:              ", agentFactory);
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
        address identityRegistry = vm.envAddress("IDENTITY_REGISTRY_ADDRESS");
        address agentFactory = vm.envAddress("AGENT_FACTORY_ADDRESS");
        ServiceRegistry registry = new ServiceRegistry(deployer, identityRegistry, agentFactory);

        // 2. Deploy new x402Gateway pointing to new registry
        x402Gateway gateway = new x402Gateway(address(registry), MOCK_USDC, identityRegistry, agentFactory);

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
        address identityRegistry = vm.envAddress("IDENTITY_REGISTRY_ADDRESS");
        address agentFactory = vm.envAddress("AGENT_FACTORY_ADDRESS");

        console2.log("Deployer:", deployer);
        console2.log("Proxy signer:", proxySigner);
        console2.log("USDC (real):", REAL_USDC);
        console2.log("IdentityRegistry:", identityRegistry);
        console2.log("AgentFactory:", agentFactory);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new ServiceRegistry
        ServiceRegistry registry = new ServiceRegistry(deployer, identityRegistry, agentFactory);

        // 2. Deploy new x402Gateway pointing to new registry, using REAL USDC
        x402Gateway gateway = new x402Gateway(address(registry), REAL_USDC, identityRegistry, agentFactory);

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
        console2.log("IdentityRegistry:", identityRegistry);
        console2.log("AgentFactory:", agentFactory);
        console2.log("Proxy signer authorized:", proxySigner);
    }
}

// forge script script/Deploy.s.sol:RedeployGatewayRealUSDC --rpc-url base_sepolia --broadcast --verify -vvvv

/// @title RedeployAll
/// @notice Full redeployment of all PragmaMoney contracts on Base Sepolia.
/// @dev Handles circular dependency: AgentFactory needs scoreOracle, ScoreOracle needs agentFactory.
///      Solution: deploy AgentFactory with deployer as placeholder scoreOracle, then deploy ScoreOracle,
///      then call setScoreOracle. Global contracts (IdentityRegistry, ReputationRegistry, EntryPoint, USDC)
///      are NOT redeployed.
contract RedeployAll is Script {
    // ── Global addresses (NOT redeployed) ──
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address constant REAL_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address proxySigner = vm.envAddress("PROXY_SIGNER_ADDRESS");

        console2.log("=== RedeployAll ===");
        console2.log("Deployer:", deployer);
        console2.log("Proxy signer:", proxySigner);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. AgentSmartAccount implementation (no deps)
        AgentSmartAccount accountImpl = new AgentSmartAccount();
        console2.log("1. AgentSmartAccount impl:", address(accountImpl));

        // 2. AgentAccountFactory (step1 + EntryPoint)
        AgentAccountFactory accountFactory = new AgentAccountFactory(address(accountImpl), ENTRY_POINT);
        console2.log("2. AgentAccountFactory:", address(accountFactory));

        // 3. ReputationReporter implementation (no deps)
        ReputationReporter reporterImpl = new ReputationReporter();
        console2.log("3. ReputationReporter impl:", address(reporterImpl));

        // 4. ReputationReporter ERC1967Proxy (step3, init with deployer as owner+admin)
        bytes memory reporterInitData = abi.encodeCall(
            ReputationReporter.initialize,
            (deployer, deployer, REPUTATION_REGISTRY, IDENTITY_REGISTRY)
        );
        ERC1967Proxy reporterProxy = new ERC1967Proxy(address(reporterImpl), reporterInitData);
        console2.log("4. ReputationReporter proxy:", address(reporterProxy));

        // 5. AgentFactory (IdReg, deployer owner, deployer admin, deployer as placeholder scoreOracle, step4)
        AgentFactory agentFactory = new AgentFactory(
            IIdentityRegistry(IDENTITY_REGISTRY),
            deployer,                   // owner
            deployer,                   // admin
            deployer,                   // scoreOracle placeholder (will be replaced in step 8)
            address(reporterProxy)      // reputationReporter
        );
        console2.log("5. AgentFactory:", address(agentFactory));

        // 6. Set AgentFactory as admin on ReputationReporter proxy
        ReputationReporter(address(reporterProxy)).setAdmin(address(agentFactory));
        console2.log("6. reporterProxy.setAdmin(agentFactory)");

        // 7. ScoreOracle (RepReg, step5, step4, deployer owner, deployer admin)
        ScoreOracle scoreOracle = new ScoreOracle(
            IReputationRegistry(REPUTATION_REGISTRY),
            IAgentFactory(address(agentFactory)),
            address(reporterProxy),
            deployer,                   // owner
            deployer                    // admin
        );
        console2.log("7. ScoreOracle:", address(scoreOracle));

        // 8. Resolve circular dep: set real ScoreOracle on AgentFactory
        agentFactory.setScoreOracle(address(scoreOracle));
        console2.log("8. agentFactory.setScoreOracle(scoreOracle)");

        // 9. ServiceRegistry (deployer owner, IdReg, step5)
        ServiceRegistry registry = new ServiceRegistry(deployer, IDENTITY_REGISTRY, address(agentFactory));
        console2.log("9. ServiceRegistry:", address(registry));

        // 10. x402Gateway (step9, USDC, IdReg, step5)
        x402Gateway gateway = new x402Gateway(address(registry), REAL_USDC, IDENTITY_REGISTRY, address(agentFactory));
        console2.log("10. x402Gateway:", address(gateway));

        // 11. Authorize gateway on ServiceRegistry
        registry.setGateway(address(gateway));
        console2.log("11. registry.setGateway(gateway)");

        // 12. Authorize proxy signer as recorder on ServiceRegistry
        registry.setRecorder(proxySigner, true);
        console2.log("12. registry.setRecorder(proxySigner)");

        // 13. Set global trusted contracts on AgentAccountFactory
        // These contracts can be called by any agent without per-agent setTargetAllowed
        accountFactory.setTrustedContract(address(gateway), true);
        accountFactory.setTrustedContract(address(registry), true);
        accountFactory.setTrustedContract(address(reporterProxy), true);
        accountFactory.setTrustedContract(REAL_USDC, true);
        console2.log("13. Set trusted contracts: gateway, registry, reporter, USDC");

        // 14. Set global trusted tokens on AgentAccountFactory
        accountFactory.setTrustedToken(REAL_USDC, true);
        console2.log("14. Set trusted token: USDC");

        // 15. Set Uniswap and app-specific tokens as globally trusted
        address uniswapRouter = 0x492E6456D9528771018DeB9E87ef7750EF184104;
        address superRealFakeUsdc = 0x04eAFA8141F06Ff882b5Aa21064cCBd9E48DfbB8;
        address bingerToken = 0xC8308c6bc561A46275256981dd17298c31300595;
        address rfusdc = 0x8ac2EeF8EA8f63bc6109c22f7c505962B96cEab0;
        address permit2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

        accountFactory.setTrustedContract(uniswapRouter, true);
        accountFactory.setTrustedContract(superRealFakeUsdc, true);
        accountFactory.setTrustedContract(bingerToken, true);
        accountFactory.setTrustedContract(rfusdc, true);
        accountFactory.setTrustedContract(permit2, true);
        console2.log("15. Set trusted contracts: uniswap, superRealFakeUsdc, bingerToken, rfusdc, permit2");

        accountFactory.setTrustedToken(superRealFakeUsdc, true);
        accountFactory.setTrustedToken(bingerToken, true);
        accountFactory.setTrustedToken(rfusdc, true);
        console2.log("16. Set trusted tokens: superRealFakeUsdc, bingerToken, rfusdc");

        vm.stopBroadcast();

        // ── Summary ──
        console2.log("");
        console2.log("=== Deployment Summary ===");
        console2.log("AgentSmartAccount (impl):  ", address(accountImpl));
        console2.log("AgentAccountFactory:       ", address(accountFactory));
        console2.log("ReputationReporter (impl): ", address(reporterImpl));
        console2.log("ReputationReporter (proxy):", address(reporterProxy));
        console2.log("AgentFactory:              ", address(agentFactory));
        console2.log("ScoreOracle:               ", address(scoreOracle));
        console2.log("ServiceRegistry:           ", address(registry));
        console2.log("x402Gateway:               ", address(gateway));
        console2.log("");
        console2.log("=== Globals (unchanged) ===");
        console2.log("IdentityRegistry:          ", IDENTITY_REGISTRY);
        console2.log("ReputationRegistry:        ", REPUTATION_REGISTRY);
        console2.log("EntryPoint v0.7:           ", ENTRY_POINT);
        console2.log("Real USDC:                 ", REAL_USDC);
        console2.log("Proxy signer:              ", proxySigner);
        console2.log("");
        console2.log("=== Global Trusted Contracts ===");
        console2.log("Gateway, Registry, Reporter, USDC, Uniswap, SuperRealFakeUSDC, BingerToken, RFUSDC");
    }
}

// forge script script/Deploy.s.sol:RedeployAll --rpc-url base_sepolia --broadcast --verify -vvvv

/// @title DeployArc
/// @notice Full deployment of all PragmaMoney contracts on Arc Testnet (chain 5042002).
/// @dev Arc testnet has no global ERC-8004 contracts, so we deploy IdentityRegistry + ReputationRegistry.
///      Arc uses USDC as native gas (addr 0x3600...000), but we use standard 6-decimal USDC for payments.
contract DeployArc is Script {
    // ── Arc Testnet Native USDC (system contract, 18 decimals for gas) ──
    // For payments we use 6-decimal representation, same address but different interface
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    // ── ERC-4337 EntryPoint v0.7 (canonical create2 address, should work on any EVM) ──
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address proxySigner = vm.envAddress("PROXY_SIGNER_ADDRESS");

        console2.log("=== DeployArc (Chain 5042002) ===");
        console2.log("Deployer:", deployer);
        console2.log("Proxy signer:", proxySigner);
        console2.log("USDC (Arc native):", ARC_USDC);
        console2.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ──────────────────────────────────────────────────────────────────────
        // PHASE 1: Deploy ERC-8004 Global Contracts (not on Arc by default)
        // ──────────────────────────────────────────────────────────────────────

        // 1a. IdentityRegistry implementation (upgradeable UUPS)
        // Note: Using non-upgradeable simple version for Arc to avoid complexity
        // We create a minimal proxy pattern manually

        // For simplicity, deploy the upgradeable contract directly and initialize
        // In production, use proper UUPS proxy pattern

        // Using direct import from erc-8004-contracts would require remappings
        // Instead, we'll document that Arc deployment requires:
        // - Manual deployment of IdentityRegistry from erc-8004-contracts
        // - OR use the same global address if/when Circle deploys it

        // For now, we skip deploying ERC-8004 contracts and require them as env vars
        // This matches the Base Sepolia pattern where they're global
        address identityRegistry = vm.envOr("IDENTITY_REGISTRY_ADDRESS", address(0));
        address reputationRegistry = vm.envOr("REPUTATION_REGISTRY_ADDRESS", address(0));

        if (identityRegistry == address(0)) {
            console2.log("WARNING: IDENTITY_REGISTRY_ADDRESS not set. Deploy ERC-8004 contracts separately.");
            console2.log("See: erc-8004-contracts/contracts/IdentityRegistryUpgradeable.sol");
            revert("Missing IDENTITY_REGISTRY_ADDRESS");
        }
        if (reputationRegistry == address(0)) {
            console2.log("WARNING: REPUTATION_REGISTRY_ADDRESS not set. Deploy ERC-8004 contracts separately.");
            console2.log("See: erc-8004-contracts/contracts/ReputationRegistryUpgradeable.sol");
            revert("Missing REPUTATION_REGISTRY_ADDRESS");
        }

        console2.log("Using IdentityRegistry:", identityRegistry);
        console2.log("Using ReputationRegistry:", reputationRegistry);

        // ──────────────────────────────────────────────────────────────────────
        // PHASE 2: Deploy PragmaMoney Contracts (same as RedeployAll)
        // ──────────────────────────────────────────────────────────────────────

        // 1. AgentSmartAccount implementation (no deps)
        AgentSmartAccount accountImpl = new AgentSmartAccount();
        console2.log("1. AgentSmartAccount impl:", address(accountImpl));

        // 2. AgentAccountFactory (step1 + EntryPoint)
        AgentAccountFactory accountFactory = new AgentAccountFactory(address(accountImpl), ENTRY_POINT);
        console2.log("2. AgentAccountFactory:", address(accountFactory));

        // 3. ReputationReporter implementation (no deps)
        ReputationReporter reporterImpl = new ReputationReporter();
        console2.log("3. ReputationReporter impl:", address(reporterImpl));

        // 4. ReputationReporter ERC1967Proxy (step3, init with deployer as owner+admin)
        bytes memory reporterInitData = abi.encodeCall(
            ReputationReporter.initialize,
            (deployer, deployer, reputationRegistry, identityRegistry)
        );
        ERC1967Proxy reporterProxy = new ERC1967Proxy(address(reporterImpl), reporterInitData);
        console2.log("4. ReputationReporter proxy:", address(reporterProxy));

        // 5. AgentFactory (IdReg, deployer owner, deployer admin, deployer as placeholder scoreOracle, step4)
        AgentFactory agentFactory = new AgentFactory(
            IIdentityRegistry(identityRegistry),
            deployer,                   // owner
            deployer,                   // admin
            deployer,                   // scoreOracle placeholder (will be replaced in step 8)
            address(reporterProxy)      // reputationReporter
        );
        console2.log("5. AgentFactory:", address(agentFactory));

        // 6. Set AgentFactory as admin on ReputationReporter proxy
        ReputationReporter(address(reporterProxy)).setAdmin(address(agentFactory));
        console2.log("6. reporterProxy.setAdmin(agentFactory)");

        // 7. ScoreOracle (RepReg, step5, step4, deployer owner, deployer admin)
        ScoreOracle scoreOracle = new ScoreOracle(
            IReputationRegistry(reputationRegistry),
            IAgentFactory(address(agentFactory)),
            address(reporterProxy),
            deployer,                   // owner
            deployer                    // admin
        );
        console2.log("7. ScoreOracle:", address(scoreOracle));

        // 8. Resolve circular dep: set real ScoreOracle on AgentFactory
        agentFactory.setScoreOracle(address(scoreOracle));
        console2.log("8. agentFactory.setScoreOracle(scoreOracle)");

        // 9. ServiceRegistry (deployer owner, IdReg, step5)
        ServiceRegistry registry = new ServiceRegistry(deployer, identityRegistry, address(agentFactory));
        console2.log("9. ServiceRegistry:", address(registry));

        // 10. x402Gateway (step9, USDC, IdReg, step5)
        x402Gateway gateway = new x402Gateway(address(registry), ARC_USDC, identityRegistry, address(agentFactory));
        console2.log("10. x402Gateway:", address(gateway));

        // 11. Authorize gateway on ServiceRegistry
        registry.setGateway(address(gateway));
        console2.log("11. registry.setGateway(gateway)");

        // 12. Authorize proxy signer as recorder on ServiceRegistry
        registry.setRecorder(proxySigner, true);
        console2.log("12. registry.setRecorder(proxySigner)");

        // 13. Set global trusted contracts on AgentAccountFactory
        accountFactory.setTrustedContract(address(gateway), true);
        accountFactory.setTrustedContract(address(registry), true);
        accountFactory.setTrustedContract(address(reporterProxy), true);
        accountFactory.setTrustedContract(ARC_USDC, true);
        console2.log("13. Set trusted contracts: gateway, registry, reporter, USDC");

        // 14. Set global trusted tokens on AgentAccountFactory
        accountFactory.setTrustedToken(ARC_USDC, true);
        console2.log("14. Set trusted token: USDC");

        vm.stopBroadcast();

        // ── Summary ──
        console2.log("");
        console2.log("=== Arc Testnet Deployment Summary ===");
        console2.log("Chain ID:                  5042002");
        console2.log("RPC:                       https://rpc.testnet.arc.network");
        console2.log("");
        console2.log("AgentSmartAccount (impl):  ", address(accountImpl));
        console2.log("AgentAccountFactory:       ", address(accountFactory));
        console2.log("ReputationReporter (impl): ", address(reporterImpl));
        console2.log("ReputationReporter (proxy):", address(reporterProxy));
        console2.log("AgentFactory:              ", address(agentFactory));
        console2.log("ScoreOracle:               ", address(scoreOracle));
        console2.log("ServiceRegistry:           ", address(registry));
        console2.log("x402Gateway:               ", address(gateway));
        console2.log("");
        console2.log("=== Globals ===");
        console2.log("IdentityRegistry:          ", identityRegistry);
        console2.log("ReputationRegistry:        ", reputationRegistry);
        console2.log("EntryPoint v0.7:           ", ENTRY_POINT);
        console2.log("USDC (Arc native):         ", ARC_USDC);
        console2.log("Proxy signer:              ", proxySigner);
        console2.log("");
        console2.log("=== Global Trusted Contracts ===");
        console2.log("Gateway, Registry, Reporter, USDC");
        console2.log("");
        console2.log("=== Next Steps ===");
        console2.log("1. Update proxy/.env with Arc addresses");
        console2.log("2. Update pragma-agent/src/config.ts");
        console2.log("3. Test agent registration on Arc");
    }
}

// forge script script/Deploy.s.sol:DeployArc --rpc-url arc_testnet --broadcast -vvvv
