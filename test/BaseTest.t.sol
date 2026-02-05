// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Addresses} from "./Addresses.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IdentityRegistryUpgradeable} from "../src/ERC-8004/IdentityRegistry.sol";
import {ReputationRegistryUpgradeable} from "../src/ERC-8004/ReputationRegistry.sol";
import {ReputationReporter} from "../src/ERC-8004/ReputationReporter.sol";
import {AgentPool} from "../src/Launchpad/AgentPool.sol";
import {AgentFactory} from "../src/Launchpad/AgentFactory.sol";
import {IIdentityRegistry as FactoryIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";

contract BaseTest is Test {
    address internal deployer = address(0xD3D3);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal agentOwner = address(0xA6E17);
    address internal validator1 = address(0x1111);
    address internal validator2 = address(0x2222);

    // === Base Sepolia fork placeholders (override with env) ===
    string internal constant DEFAULT_CHAIN = "baseSepolia";
    string internal constant DEFAULT_RPC_ENV = "BASE_SEPOLIA_RPC_URL";

    IERC20 internal usdc;

    function _setOwnableOwner(address target, address newOwner) internal {
        // OwnableUpgradeable storage slot (OZ v5)
        bytes32 slot = _ownableStorageSlot();
        vm.store(target, slot, bytes32(uint256(uint160(newOwner))));
    }

    function _ownableStorageSlot() internal pure returns (bytes32) {
        return 0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300;
    }

    function _startFork() internal {
        string memory rpc = vm.envOr("RPC_URL", string(DEFAULT_RPC_ENV));
        uint256 blockNumber = vm.envOr("BLOCK_NUMBER", uint256(0));
        if (blockNumber == 0) {
            vm.createSelectFork(vm.envString(rpc));
        } else {
            vm.createSelectFork(vm.envString(rpc), blockNumber);
        }
    }

    function _setupUsdc() internal {
        Addresses addrs = new Addresses();
        address usdcAddr = vm.envOr("USDC_ADDRESS", addrs.getAddress(DEFAULT_CHAIN, "USDC"));
        require(usdcAddr != address(0), "set USDC_ADDRESS");
        usdc = IERC20(usdcAddr);
    }

    function _fundAndApprove(address user, AgentPool pool, uint256 amount) internal {
        deal(address(usdc), user, amount);
        vm.prank(user);
        usdc.approve(address(pool), amount);
    }

    function _deployIdentity() internal returns (IdentityRegistryUpgradeable id) {
        IdentityRegistryUpgradeable impl = new IdentityRegistryUpgradeable();
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), "");
        id = IdentityRegistryUpgradeable(address(proxy));
        _setOwnableOwner(address(id), deployer);
        id.initialize();
    }

    function _deployReputation(address identity) internal returns (ReputationRegistryUpgradeable rep) {
        ReputationRegistryUpgradeable impl = new ReputationRegistryUpgradeable();
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), "");
        rep = ReputationRegistryUpgradeable(address(proxy));
        _setOwnableOwner(address(rep), deployer);
        rep.initialize(identity);
    }

    function _deployReporter(address reputationRegistry, address identityRegistry)
        internal
        returns (ReputationReporter reporter)
    {
        ReputationReporter impl = new ReputationReporter();
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), "");
        reporter = ReputationReporter(address(proxy));
        reporter.initialize(deployer, deployer, reputationRegistry, identityRegistry);
    }

    function deployAll()
        internal
        returns (
            IdentityRegistryUpgradeable id,
            ReputationRegistryUpgradeable rep,
            ReputationReporter reporter,
            AgentPool pool,
            AgentFactory factory
        )
    {
        _startFork();
        _setupUsdc();
        vm.startPrank(deployer);

        id = _deployIdentity();

        rep = _deployReputation(address(id));

        reporter = _deployReporter(address(rep), address(id));

        vm.stopPrank();
        vm.prank(agentOwner);
        uint256 agentId = id.register("file://metadata/agent-1.json");
        vm.startPrank(deployer);

        pool = new AgentPool(
            usdc,
            "Agent Pool",
            "APOOL",
            deployer,
            deployer,
            FactoryIdentityRegistry(address(id)),
            agentId,
            deployer,
            100e6,
            7 days,
            "file://metadata/agent-1.json"
        );

        factory = new AgentFactory(FactoryIdentityRegistry(address(id)), deployer, deployer, deployer, address(reporter));
        reporter.setAdmin(address(factory));

        vm.stopPrank();
    }
}
