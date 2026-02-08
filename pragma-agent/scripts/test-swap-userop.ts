/**
 * Standalone test: V4 swap via UserOps (smart account)
 *
 * Tests if Permit2 + Uniswap V4 works via 4337 UserOps
 */

import "dotenv/config";
import { JsonRpcProvider, formatUnits } from "ethers";
import { bytesToHex, hexToBytes } from "viem";
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
import {
  RPC_URL,
  RFUSDC_ADDRESS,
  SUPER_FAKE_USDC_ADDRESS,
  BINGER_TOKEN_ADDRESS,
  PERMIT2_ADDRESS,
  UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
  ERC20_ABI,
  PIMLICO_API_KEY,
} from "../src/config.js";
import { Contract } from "ethers";

const { RoutePlanner, CommandType } = require("@uniswap/universal-router-sdk");
const { Actions, URVersion, V4Planner } = require("@uniswap/v4-sdk");

function normalizeHex(value: string): `0x${string}` {
  const hex = (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
  return bytesToHex(hexToBytes(hex));
}

async function main() {
  console.log("=== Standalone V4 Swap via UserOps ===\n");

  if (!PIMLICO_API_KEY) {
    console.error("PIMLICO_API_KEY required");
    process.exit(1);
  }

  const walletA = loadOrCreateWalletByFile("wallet.json");
  const regA = getRegistrationByFile("wallet.json");

  if (!regA) {
    console.error("Agent A not registered. Run E2E test first.");
    process.exit(1);
  }

  console.log(`Smart Account: ${regA.smartAccount}`);
  console.log(`Operator: ${walletA.address}\n`);

  const provider = new JsonRpcProvider(RPC_URL);
  const swapAmount = 1_000_000n; // 1 RFUSDC
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
    amountIn: swapAmount.toString(),
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

  const maxUint256 = (1n << 256n) - 1n;
  const maxUint160 = (1n << 160n) - 1n;
  const maxUint48 = (1n << 48n) - 1n;

  // Step 1: Mint RFUSDC
  console.log("1/6 Minting RFUSDC...");
  const r1 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildMintCall(RFUSDC_ADDRESS as `0x${string}`, regA.smartAccount as `0x${string}`, swapAmount)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${r1.txHash}\n`);

  // Step 2: Approve SuperFakeUSDC
  console.log("2/6 Approving SuperFakeUSDC to spend RFUSDC...");
  await new Promise((r) => setTimeout(r, 3000));
  const r2 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildApproveCall(RFUSDC_ADDRESS as `0x${string}`, SUPER_FAKE_USDC_ADDRESS as `0x${string}`, swapAmount)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${r2.txHash}\n`);

  // Step 3: Upgrade
  console.log("3/6 Upgrading RFUSDC → SuperFakeUSDC...");
  await new Promise((r) => setTimeout(r, 3000));
  const r3 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildUpgradeCall(SUPER_FAKE_USDC_ADDRESS as `0x${string}`, swapAmount)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${r3.txHash}\n`);

  // Step 4: Approve Permit2
  console.log("4/6 Approving Permit2 to spend SuperFakeUSDC...");
  await new Promise((r) => setTimeout(r, 5000)); // longer delay
  const r4 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildApproveCall(SUPER_FAKE_USDC_ADDRESS as `0x${string}`, PERMIT2_ADDRESS as `0x${string}`, maxUint256)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${r4.txHash}\n`);

  // Step 5: Permit2 approve router
  console.log("5/6 Permit2 approving router...");
  await new Promise((r) => setTimeout(r, 3000));
  const r5 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildPermit2ApproveCall(
      PERMIT2_ADDRESS as `0x${string}`,
      SUPER_FAKE_USDC_ADDRESS as `0x${string}`,
      router,
      maxUint160,
      maxUint48,
    )],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${r5.txHash}\n`);

  // Step 6: Execute swap
  console.log("6/6 Executing swap...");
  await new Promise((r) => setTimeout(r, 3000));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const r6 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildUniversalRouterExecuteCall(router, commands, inputs, deadline)],
    { skipSponsorship: true },
  );
  console.log(`  tx: ${r6.txHash}\n`);

  // Check result
  const bingerToken = new Contract(BINGER_TOKEN_ADDRESS, ERC20_ABI, provider);
  const balance: bigint = await bingerToken.balanceOf(regA.smartAccount);
  console.log(`BingerToken balance: ${formatUnits(balance, 18)} BINGER`);
  console.log("\n=== SWAP SUCCESS ===");
}

main().catch((err) => {
  console.error("Swap failed:", err.message);
  process.exit(1);
});
