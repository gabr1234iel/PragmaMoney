/**
 * Integration test for the pragma-agent full flow.
 *
 * Prerequisites:
 *   1. Proxy running: cd proxy && npm run dev
 *   2. Deployer has ETH on Base Sepolia for gas
 *   3. (Optional) PIMLICO_API_KEY env var for UserOp tests
 *
 * Usage:
 *   cd pragma-agent && npx tsx scripts/test-register.ts
 *
 * Env vars:
 *   RELAYER_URL   — proxy URL (default: http://localhost:4402)
 *   PIMLICO_API_KEY — enables UserOp tests (pool pull, pay, call)
 */

import { handleWallet } from "../src/wallet.js";
import { handleRegister } from "../src/register.js";
import { handleServices } from "../src/services.js";
import { handlePool } from "../src/pool.js";
import { handlePay } from "../src/pay.js";
import { PIMLICO_API_KEY, RELAYER_URL } from "../src/config.js";

function log(label: string, data: unknown) {
  console.log(`  ${label}:`, typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function main() {
  console.log("=== pragma-agent Integration Test ===");
  console.log(`  Relayer: ${RELAYER_URL}`);
  console.log(`  Pimlico: ${PIMLICO_API_KEY ? "configured" : "NOT SET (UserOp tests will be skipped)"}`);
  console.log();

  // ── Step 1: Check wallet ──────────────────────────────────────────────
  console.log("--- Step 1: Check wallet (pre-registration) ---");
  const walletBefore = JSON.parse(await handleWallet({ action: "getAddress" }));
  log("EOA", walletBefore.eoaAddress);
  log("Registered", walletBefore.registered);
  console.log();

  // ── Step 2: Check balance ─────────────────────────────────────────────
  console.log("--- Step 2: Check balance ---");
  const balance = JSON.parse(await handleWallet({ action: "getBalance" }));
  log("ETH", `${balance.ethBalance} ETH`);
  log("USDC", `${balance.usdcBalance} USDC (at ${balance.usdcAddress})`);
  console.log();

  // ── Step 3: List services ─────────────────────────────────────────────
  console.log("--- Step 3: List services ---");
  const services = JSON.parse(await handleServices({ action: "list" }));
  log("Count", services.count ?? services.services?.length ?? 0);
  if (services.services?.length > 0) {
    for (const s of services.services.slice(0, 3)) {
      log("Service", `${s.name} (${s.serviceType}) — ${s.pricePerCall} USDC/call`);
    }
  }
  console.log();

  // ── Step 4: Register ──────────────────────────────────────────────────
  if (walletBefore.registered) {
    console.log("--- Step 4: Already registered, skipping ---");
    log("agentId", walletBefore.agentId);
    log("smartAccount", walletBefore.smartAccountAddress);
    log("pool", walletBefore.poolAddress);
  } else {
    console.log("--- Step 4: Register agent via relayer ---");
    const regResult = JSON.parse(await handleRegister({
      action: "register",
      name: "TestAgent",
      description: "Integration test agent",
      endpoint: "https://test.example.com",
      dailyLimit: "100",
      expiryDays: 90,
      poolDailyCap: "50",
      poolVestingDays: 30,
    }));

    if (regResult.error) {
      console.error("  FAILED:", regResult.error);
      if (regResult.details) console.error("  Details:", regResult.details);
      process.exit(1);
    } else {
      console.log("  SUCCESS!");
      log("agentId", regResult.agentId);
      log("smartAccount", regResult.smartAccountAddress);
      log("pool", regResult.poolAddress);
      log("txHashes", regResult.txHashes);
    }
  }
  console.log();

  // ── Step 5: Post-registration wallet state ────────────────────────────
  console.log("--- Step 5: Check wallet (post-registration) ---");
  const walletAfter = JSON.parse(await handleWallet({ action: "getAddress" }));
  log("Registered", walletAfter.registered);
  log("smartAccount", walletAfter.smartAccountAddress);
  log("pool", walletAfter.poolAddress);
  console.log();

  // ── Step 6: Spending policy ───────────────────────────────────────────
  console.log("--- Step 6: Check spending policy ---");
  const policy = JSON.parse(await handleWallet({ action: "getPolicy" }));
  if (policy.error) {
    log("Error", policy.error);
  } else {
    log("Daily limit", `${policy.policy.dailyLimit} USDC`);
    log("Expires", policy.policy.expiresAtDate);
    log("Owner", policy.owner);
    log("Operator", policy.operator);
  }
  console.log();

  // ── Step 7: Smart account balance ─────────────────────────────────────
  console.log("--- Step 7: Smart account balance ---");
  const balanceAfter = JSON.parse(await handleWallet({ action: "getBalance" }));
  log("Smart account USDC", `${balanceAfter.usdcBalance} USDC`);
  console.log();

  // ── Step 8: Pool info ─────────────────────────────────────────────────
  console.log("--- Step 8: Pool info ---");
  const poolInfo = JSON.parse(await handlePool({ action: "info" }));
  if (poolInfo.error) {
    log("Error", poolInfo.error);
  } else {
    log("Pool name", poolInfo.name);
    log("Total assets", `${poolInfo.totalAssets} USDC`);
    log("Daily cap", `${poolInfo.dailyCap} USDC`);
    log("Remaining today", `${poolInfo.remainingCapToday ?? "N/A"}`);
  }
  console.log();

  // ── Step 9: UserOp tests (only if Pimlico key is set) ─────────────────
  if (!PIMLICO_API_KEY) {
    console.log("--- Step 9: UserOp tests SKIPPED (set PIMLICO_API_KEY to enable) ---");
  } else {
    console.log("--- Step 9: UserOp tests ---");

    // 9a. Pool pull (needs pool to have USDC deposited)
    console.log("  9a. Attempting pool pull (0.01 USDC)...");
    const pullResult = JSON.parse(await handlePool({
      action: "pull",
      amount: "0.01",
    }));
    if (pullResult.error) {
      log("Pull error (expected if pool empty)", pullResult.error);
    } else {
      log("Pull success", `txHash=${pullResult.txHash}`);
    }

    // 9b. Pay for a service (needs smart account to have USDC)
    if (services.services?.length > 0) {
      const svc = services.services[0];
      console.log(`  9b. Attempting pay for "${svc.name}" (${svc.pricePerCall} USDC)...`);
      const payResult = JSON.parse(await handlePay({
        action: "pay",
        serviceId: svc.serviceId,
        calls: 1,
      }));
      if (payResult.error) {
        log("Pay error (expected if no USDC)", payResult.error);
      } else {
        log("Pay success", `txHash=${payResult.txHash}, paymentId=${payResult.paymentId}`);
      }
    }
  }

  console.log("\n=== Test Complete ===");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
