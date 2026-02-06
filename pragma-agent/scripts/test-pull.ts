/**
 * Test script: pull USDC from AgentPool via UserOp
 *
 * Smart account 0xafc2... calls pool.pull(deployer, 10000)
 * Operator = deployer (0x567b)
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { sendUserOp, buildPoolPullCall } from "../src/userop.js";

// Load PROXY_SIGNER_KEY from proxy/.env
const envPath = resolve(new URL(".", import.meta.url).pathname, "../../proxy/.env");
const envContent = readFileSync(envPath, "utf-8");
const keyMatch = envContent.match(/PROXY_SIGNER_KEY=(0x[0-9a-fA-F]+)/);
if (!keyMatch) throw new Error(`PROXY_SIGNER_KEY not found in ${envPath}`);

const SMART_ACCOUNT = "0xafc288ACf99EC342217664258ef653DC9fC51f5b" as `0x${string}`;
const POOL = "0xD23724E13BD93d49b0332d4919Aaca4BFA824255" as `0x${string}`;
const DEPLOYER = "0x567bDc4086eFc460811798d1075a21359E34072d" as `0x${string}`;
const DEPLOYER_KEY = keyMatch[1] as `0x${string}`;

// Pull 0.01 USDC (10000 units) to deployer
const PULL_AMOUNT = 10000n;

async function main() {
  console.log(`Pulling ${PULL_AMOUNT} USDC units from pool ${POOL}`);
  console.log(`Smart account: ${SMART_ACCOUNT}`);
  console.log(`Destination: ${DEPLOYER}`);

  const call = buildPoolPullCall(POOL, DEPLOYER, PULL_AMOUNT);
  console.log("\nSending UserOp...");

  const result = await sendUserOp(SMART_ACCOUNT, DEPLOYER_KEY, [call], { skipSponsorship: true });

  console.log("\nResult:");
  console.log(`  success:    ${result.success}`);
  console.log(`  txHash:     ${result.txHash}`);
  console.log(`  userOpHash: ${result.userOpHash}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
