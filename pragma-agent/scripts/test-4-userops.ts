/**
 * Minimal test: 4 consecutive UserOps to isolate AA24 issue
 */

import "dotenv/config";
import {
  loadOrCreateWalletByFile,
  getRegistrationByFile,
} from "../src/wallet.js";
import { sendUserOp, buildMintCall } from "../src/userop.js";
import { RFUSDC_ADDRESS, PIMLICO_API_KEY } from "../src/config.js";

async function main() {
  console.log("=== 4 Consecutive UserOps Test ===\n");

  if (!PIMLICO_API_KEY) {
    console.error("PIMLICO_API_KEY required");
    process.exit(1);
  }

  const wallet = loadOrCreateWalletByFile("wallet.json");
  const reg = getRegistrationByFile("wallet.json");

  if (!reg) {
    console.error("Agent not registered");
    process.exit(1);
  }

  console.log(`Smart Account: ${reg.smartAccount}`);
  console.log(`Operator: ${wallet.address}\n`);

  const mintCall = buildMintCall(
    RFUSDC_ADDRESS as `0x${string}`,
    reg.smartAccount as `0x${string}`,
    1_000_000n
  );

  for (let i = 1; i <= 6; i++) {
    console.log(`UserOp ${i}/6: Minting RFUSDC...`);
    try {
      const result = await sendUserOp(
        reg.smartAccount as `0x${string}`,
        wallet.privateKey as `0x${string}`,
        [mintCall],
        { skipSponsorship: true }
      );
      console.log(`  SUCCESS: ${result.txHash}\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  FAILED: ${msg}\n`);
      if (msg.includes("AA24")) {
        console.log(`AA24 occurred on UserOp #${i}`);
        break;
      }
    }
    // Small delay between ops
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("=== Test Complete ===");
}

main().catch(console.error);
