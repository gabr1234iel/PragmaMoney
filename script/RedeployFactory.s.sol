// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AgentSmartAccount} from "../src/Wallet/AgentSmartAccount.sol";
import {AgentAccountFactory} from "../src/Wallet/AgentAccountFactory.sol";

contract RedeployFactory is Script {
    address constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address constant REAL_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // 1. Deploy new impl
        AgentSmartAccount impl = new AgentSmartAccount();
        console2.log("AgentSmartAccount impl:", address(impl));

        // 2. Deploy new factory
        AgentAccountFactory factory = new AgentAccountFactory(address(impl), ENTRY_POINT);
        console2.log("AgentAccountFactory:", address(factory));

        // 3. Set all trusted contracts
        factory.setTrustedContract(0x112B51549AeaF1456E2C04aAE92bC9660b604101, true); // gateway
        factory.setTrustedContract(0x70B74F9D67385d363d4bdd3079b72E60f8EcbaFa, true); // serviceRegistry
        factory.setTrustedContract(0xC038404e1fe7dc1FBD19773dB922ced6E2a896B8, true); // reputationReporter
        factory.setTrustedContract(REAL_USDC, true);
        factory.setTrustedContract(0x492E6456D9528771018DeB9E87ef7750EF184104, true); // uniswapRouter
        factory.setTrustedContract(0x04eAFA8141F06Ff882b5Aa21064cCBd9E48DfbB8, true); // superFakeUSDC
        factory.setTrustedContract(0xC8308c6bc561A46275256981dd17298c31300595, true); // bingerToken
        factory.setTrustedContract(0x8ac2EeF8EA8f63bc6109c22f7c505962B96cEab0, true); // rfusdc
        factory.setTrustedContract(0x000000000022D473030F116dDEE9F6B43aC78BA3, true); // permit2
        console2.log("Set trusted contracts");

        // 4. Set trusted tokens
        factory.setTrustedToken(REAL_USDC, true);
        factory.setTrustedToken(0x04eAFA8141F06Ff882b5Aa21064cCBd9E48DfbB8, true); // superFakeUSDC
        factory.setTrustedToken(0xC8308c6bc561A46275256981dd17298c31300595, true); // bingerToken
        factory.setTrustedToken(0x8ac2EeF8EA8f63bc6109c22f7c505962B96cEab0, true); // rfusdc
        console2.log("Set trusted tokens");

        vm.stopBroadcast();
    }
}
