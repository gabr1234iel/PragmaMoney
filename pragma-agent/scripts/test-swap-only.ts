/**
 * Minimal test: just the Uniswap V4 swap via UserOp
 * Uses existing registered agent from wallet.json
 */

import "dotenv/config";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import {
  RPC_URL,
  RFUSDC_ADDRESS,
  SUPER_FAKE_USDC_ADDRESS,
  BINGER_TOKEN_ADDRESS,
  PERMIT2_ADDRESS,
  UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
  ERC20_ABI,
} from "../src/config.js";
import {
  loadOrCreateWalletByFile,
  getRegistrationByFile,
} from "../src/wallet.js";
import {
  sendUserOp,
  buildMintCall,
  buildApproveCall,
  buildUpgradeCall,
  buildPermit2ApproveCall,
  buildUniversalRouterExecuteCall,
} from "../src/userop.js";
import { keccak256, bytesToHex, hexToBytes } from "viem";

const { RoutePlanner, CommandType } = require("@uniswap/universal-router-sdk");
const { Actions, URVersion, V4Planner } = require("@uniswap/v4-sdk");

function normalizeHex(value: string): `0x${string}` {
  const hex = (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
  return bytesToHex(hexToBytes(hex));
}

async function main() {
  console.log("=== Swap-Only Test ===");

  const wallet = loadOrCreateWalletByFile("wallet.json");
  const reg = getRegistrationByFile("wallet.json");

  if (!reg) {
    console.error("No registration found. Run test-e2e.ts first.");
    process.exit(1);
  }

  console.log(`Agent: ${reg.agentId}`);
  console.log(`Smart Account: ${reg.smartAccount}`);

  const provider = new JsonRpcProvider(RPC_URL);

  // Policy now updated to dailyLimit = 1e20 to accommodate 18-decimal tokens
  // RFUSDC is 6 decimals, SuperFakeUSDC is 18 decimals
  const rfusdcAmount = 100_000n; // 0.1 RFUSDC (6 decimals)
  const superFakeAmount = rfusdcAmount * 1_000_000_000_000n; // scale to 18 decimals = 1e17
  const router = UNISWAP_UNIVERSAL_ROUTER_ADDRESS as `0x${string}`;

  // Build V4 swap calldata
  const poolKey = {
    currency0: SUPER_FAKE_USDC_ADDRESS as `0x${string}`,
    currency1: BINGER_TOKEN_ADDRESS as `0x${string}`,
    fee: 10000,
    tickSpacing: 200,
    hooks: "0x660C8Ead7d8A6c66BAd7d19a12703ca173eAC0Cc" as `0x${string}`,
  };

  const swapConfig = {
    poolKey,
    zeroForOne: true,
    amountIn: superFakeAmount.toString(),
    amountOutMinimum: "1",
    hookData: "0x",
  };

  const v4Planner = new V4Planner();
  v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig], URVersion.V2_0);
  v4Planner.addAction(Actions.SETTLE_ALL, [swapConfig.poolKey.currency0, swapConfig.amountIn], URVersion.V2_0);
  v4Planner.addAction(Actions.TAKE_ALL, [swapConfig.poolKey.currency1, "1"], URVersion.V2_0);

  const v4SwapInput = v4Planner.finalize();
  const planner = new RoutePlanner();
  planner.addCommand(CommandType.V4_SWAP, [v4SwapInput]);

  const commands = normalizeHex(planner.commands);
  const inputs = planner.inputs.map((input: string) => normalizeHex(input));

  // Step 1: Mint RFUSDC
  console.log("\n1/6 Minting RFUSDC...");
  const mintResult = await sendUserOp(
    reg.smartAccount as `0x${string}`,
    wallet.privateKey as `0x${string}`,
    [buildMintCall(RFUSDC_ADDRESS as `0x${string}`, reg.smartAccount as `0x${string}`, rfusdcAmount)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${mintResult.txHash}`);

  // Step 2: Approve SuperFakeUSDC to spend RFUSDC (use exact amount)
  await new Promise((r) => setTimeout(r, 5000));
  console.log("\n2/6 Approving SuperFakeUSDC to spend RFUSDC...");
  const approveRfusdcResult = await sendUserOp(
    reg.smartAccount as `0x${string}`,
    wallet.privateKey as `0x${string}`,
    [buildApproveCall(RFUSDC_ADDRESS as `0x${string}`, SUPER_FAKE_USDC_ADDRESS as `0x${string}`, rfusdcAmount)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${approveRfusdcResult.txHash}`);

  // Step 3: Upgrade RFUSDC to SuperFakeUSDC
  await new Promise((r) => setTimeout(r, 5000));
  console.log("\n3/6 Upgrading to SuperFakeUSDC...");
  const upgradeResult = await sendUserOp(
    reg.smartAccount as `0x${string}`,
    wallet.privateKey as `0x${string}`,
    [buildUpgradeCall(SUPER_FAKE_USDC_ADDRESS as `0x${string}`, superFakeAmount)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${upgradeResult.txHash}`);

  // Step 4: Approve Permit2 (use exact amount, not maxUint)
  // Use longer delay to ensure RPC nonce propagation
  console.log("  Waiting 15s for RPC state sync...");
  await new Promise((r) => setTimeout(r, 15000));
  console.log("\n4/6 Approving Permit2...");
  const approvePermit2Result = await sendUserOp(
    reg.smartAccount as `0x${string}`,
    wallet.privateKey as `0x${string}`,
    [buildApproveCall(SUPER_FAKE_USDC_ADDRESS as `0x${string}`, PERMIT2_ADDRESS as `0x${string}`, superFakeAmount)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${approvePermit2Result.txHash}`);

  // Step 5: Permit2 approve router (use exact amount for amount160)
  await new Promise((r) => setTimeout(r, 5000));
  console.log("\n5/6 Permit2 approving router...");
  const maxUint48 = (1n << 48n) - 1n;
  const permit2ApproveResult = await sendUserOp(
    reg.smartAccount as `0x${string}`,
    wallet.privateKey as `0x${string}`,
    [buildPermit2ApproveCall(
      PERMIT2_ADDRESS as `0x${string}`,
      SUPER_FAKE_USDC_ADDRESS as `0x${string}`,
      router,
      superFakeAmount, // use exact amount instead of maxUint160
      maxUint48,
    )],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${permit2ApproveResult.txHash}`);

  // Step 6: Execute swap
  await new Promise((r) => setTimeout(r, 5000));
  console.log("\n6/6 Executing swap...");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const swapResult = await sendUserOp(
    reg.smartAccount as `0x${string}`,
    wallet.privateKey as `0x${string}`,
    [buildUniversalRouterExecuteCall(router, commands, inputs, deadline)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${swapResult.txHash}`);

  if (!swapResult.success) {
    console.error("Swap failed!");
    process.exit(1);
  }

  // Check BingerToken balance
  const bingerToken = new Contract(BINGER_TOKEN_ADDRESS, ERC20_ABI, provider);
  const bingerBalance: bigint = await bingerToken.balanceOf(reg.smartAccount);
  console.log(`\nBingerToken balance: ${formatUnits(bingerBalance, 18)} BINGER`);

  console.log("\n=== Swap Test PASSED ===");
}

main().catch((err) => {
  console.error("Swap test failed:", err);
  process.exit(1);
});
