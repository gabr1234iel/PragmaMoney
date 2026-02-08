/**
 * E2E test: full agent lifecycle
 *
 * Steps:
 *   1.  Register agent (or skip if exists)
 *   2.  Verify registration
 *   3.  Fund smart account with ETH (for UserOp gas)
 *   4.  Seed pool with USDC (direct ethers tx using PROXY_SIGNER_KEY)
 *   5.  Verify pool funded
 *   6.  Pull USDC from pool
 *   7.  Verify smart account balance
 *   8.  Register service on-chain
 *   9.  List services
 *   10. Pay for service
 *   11. Verify payment
 *   12. Invest in own pool
 *   13. Final balances
 *
 * Prerequisites:
 *   - Proxy running at RELAYER_URL (default: http://localhost:4402)
 *   - PIMLICO_API_KEY set
 *   - PROXY_SIGNER_KEY set (deployer key, for seeding pool + funding smart account)
 *
 * Usage:
 *   cd pragma-agent && PIMLICO_API_KEY=pim_... PROXY_SIGNER_KEY=0x... npx tsx scripts/test-e2e.ts
 */

import { JsonRpcProvider, Wallet, Contract, parseUnits, parseEther, formatUnits, formatEther, ethers } from "ethers";
import { handleRegister } from "../src/register.js";
import { handleWallet, loadOrCreateWallet, getRegistration } from "../src/wallet.js";
import { handleServices } from "../src/services.js";
import { handlePool } from "../src/pool.js";
import { handlePay } from "../src/pay.js";
import {
  RPC_URL,
  USDC_ADDRESS,
  USDC_DECIMALS,
  ERC20_ABI,
  AGENT_POOL_ABI,
  PIMLICO_API_KEY,
  RELAYER_URL,
} from "../src/config.js";

// ─── Amounts (keep small to conserve testnet USDC) ──────────────────────────

const SEED_AMOUNT = "0.1";       // USDC to deposit into pool
const PULL_AMOUNT = "0.05";      // USDC to pull from pool into smart account
const SERVICE_PRICE = "0.001";   // USDC per call for test service
const INVEST_AMOUNT = "0.005";   // USDC to invest back into own pool
const ETH_FUND = "0.0003";       // ETH to fund smart account for UserOp gas

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROXY_SIGNER_KEY = process.env.PROXY_SIGNER_KEY;

function log(label: string, data: unknown) {
  console.log(`  ${label}:`, typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

function parseResult(json: string): Record<string, unknown> {
  const parsed = JSON.parse(json);
  if (parsed.error) {
    console.error(`  ERROR: ${parsed.error}`);
    if (parsed.details) console.error(`  Details: ${parsed.details}`);
    process.exit(1);
  }
  return parsed;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PragmaMoney E2E Test ===");
  console.log(`  Relayer:  ${RELAYER_URL}`);
  console.log(`  Pimlico:  ${PIMLICO_API_KEY ? "configured" : "NOT SET"}`);
  console.log(`  Deployer: ${PROXY_SIGNER_KEY ? "configured" : "NOT SET"}`);
  console.log(`  Amounts:  seed=${SEED_AMOUNT} pull=${PULL_AMOUNT} invest=${INVEST_AMOUNT} USDC`);
  console.log();

  if (!PIMLICO_API_KEY) {
    console.error("PIMLICO_API_KEY is required for E2E test");
    process.exit(1);
  }
  if (!PROXY_SIGNER_KEY) {
    console.error("PROXY_SIGNER_KEY is required for pool seeding + funding");
    process.exit(1);
  }

  const startTime = Date.now();
  const provider = new JsonRpcProvider(RPC_URL);
  const deployer = new Wallet(PROXY_SIGNER_KEY, provider);
  const deployerAddress = await deployer.getAddress();

  // ── Step 1: Register agent (or skip if exists) ──────────────────────────
  console.log("--- Step 1: Register agent ---");
  const existingReg = getRegistration();
  let agentId: string;
  let smartAccount: string;
  let poolAddress: string;

  if (existingReg) {
    console.log("  Already registered, skipping.");
    agentId = existingReg.agentId;
    smartAccount = existingReg.smartAccount;
    poolAddress = existingReg.poolAddress;
    log("agentId", agentId);
    log("smartAccount", smartAccount);
    log("poolAddress", poolAddress);
  } else {
    const regResult = parseResult(
      await handleRegister({
        action: "register",
        name: "E2E-Test-Agent",
        description: "Full lifecycle E2E test",
        endpoint: "https://e2e-test.example.com",
        dailyLimit: "100",
        expiryDays: 90,
        poolDailyCap: "50",
        poolVestingDays: 30,
      }),
    );
    agentId = regResult.agentId as string;
    smartAccount = regResult.smartAccountAddress as string;
    poolAddress = regResult.poolAddress as string;

    assert(!!agentId, "agentId should be set");
    assert(!!smartAccount, "smartAccount should be set");
    assert(!!poolAddress, "poolAddress should be set");

    log("agentId", agentId);
    log("smartAccount", smartAccount);
    log("poolAddress", poolAddress);
    console.log("  PASS");
  }
  console.log();

  // ── Step 2: Verify registration ─────────────────────────────────────────
  console.log("--- Step 2: Verify registration ---");
  const walletInfo = parseResult(
    await handleWallet({ action: "getAddress" }),
  );
  assert(walletInfo.registered === true, "registered should be true");
  assert(walletInfo.smartAccountAddress === smartAccount, "smartAccount should match");
  log("registered", walletInfo.registered);
  console.log("  PASS");
  console.log();

  // ── Step 3: Fund smart account with ETH (for UserOp gas) ───────────────
  console.log(`--- Step 3: Fund smart account with ${ETH_FUND} ETH ---`);
  const smartAcctEthBalance = await provider.getBalance(smartAccount);
  const minEthNeeded = parseEther(ETH_FUND);

  if (smartAcctEthBalance >= minEthNeeded) {
    log("existing ETH", `${formatEther(smartAcctEthBalance)} ETH (sufficient)`);
    console.log("  SKIP (already funded)");
  } else {
    log("current ETH", `${formatEther(smartAcctEthBalance)} ETH (need ${ETH_FUND})`);
    const fundTx = await deployer.sendTransaction({
      to: smartAccount,
      value: minEthNeeded,
    });
    await fundTx.wait();
    log("fund tx", fundTx.hash);
    console.log("  PASS");
  }
  console.log();

  // ── Step 4: Seed pool with USDC ─────────────────────────────────────────
  console.log(`--- Step 4: Seed pool with ${SEED_AMOUNT} USDC ---`);
  const usdc = new Contract(USDC_ADDRESS, ERC20_ABI, deployer);
  const seedAmountWei = parseUnits(SEED_AMOUNT, USDC_DECIMALS);

  // Check deployer USDC balance first
  const deployerUsdcBalance: bigint = await usdc.balanceOf(deployerAddress);
  if (deployerUsdcBalance < seedAmountWei) {
    log("deployer USDC", `${formatUnits(deployerUsdcBalance, USDC_DECIMALS)} (need ${SEED_AMOUNT})`);
    console.log("  WARNING: Deployer has insufficient USDC. Skipping pool seed.");
    console.log("  Pool may already have USDC from a previous run.");
  } else {
    // Approve pool to spend deployer's USDC
    const approveTx = await usdc.approve(poolAddress, seedAmountWei);
    await approveTx.wait();
    log("approve tx", approveTx.hash);

    // Wait for RPC state propagation
    await new Promise((r) => setTimeout(r, 3000));

    // Deposit into pool
    const pool = new Contract(poolAddress, AGENT_POOL_ABI, deployer);
    const depositTx = await pool.deposit(seedAmountWei, deployerAddress);
    await depositTx.wait();
    log("deposit tx", depositTx.hash);
    console.log("  PASS");
  }
  console.log();

  // ── Step 5: Verify pool funded ──────────────────────────────────────────
  console.log("--- Step 5: Verify pool funded ---");
  const poolInfo = parseResult(await handlePool({ action: "info" }));
  const totalAssets = parseFloat(poolInfo.totalAssets as string);
  log("totalAssets", `${poolInfo.totalAssets} USDC`);
  log("dailyCap", `${poolInfo.dailyCap} USDC`);
  assert(totalAssets > 0, "totalAssets should be > 0");
  console.log("  PASS");
  console.log();

  // ── Step 6: Pull USDC from pool ─────────────────────────────────────────
  console.log(`--- Step 6: Pull ${PULL_AMOUNT} USDC from pool ---`);
  const pullResult = parseResult(
    await handlePool({ action: "pull", amount: PULL_AMOUNT }),
  );
  log("txHash", pullResult.txHash);
  log("userOpHash", pullResult.userOpHash);
  assert(pullResult.success === true, "pull should succeed");
  console.log("  PASS");
  console.log();

  // ── Step 7: Verify smart account balance ────────────────────────────────
  console.log("--- Step 7: Verify smart account balance ---");
  await new Promise((r) => setTimeout(r, 3000));
  const balanceAfterPull = parseResult(
    await handleWallet({ action: "getBalance" }),
  );
  const usdcBalance = parseFloat(balanceAfterPull.usdcBalance as string);
  log("smartAccount USDC", `${balanceAfterPull.usdcBalance} USDC`);
  assert(usdcBalance > 0, "smart account should have USDC after pull");
  console.log("  PASS");
  console.log();

  // ── Step 8: Register service on-chain ───────────────────────────────────
  console.log("--- Step 8: Register service on-chain ---");
  const svcResult = parseResult(
    await handleServices({
      action: "register",
      name: `E2E-Test-Svc-${Date.now()}`,
      pricePerCall: SERVICE_PRICE,
      endpoint: "https://e2e-test.example.com/api",
      serviceType: "API",
    }),
  );
  const serviceId = svcResult.serviceId as string;
  log("serviceId", serviceId);
  log("txHash", svcResult.txHash);
  assert(!!serviceId, "serviceId should be set");
  console.log("  PASS");
  console.log();

  // ── Step 9: List services ───────────────────────────────────────────────
  console.log("--- Step 9: List services (verify ours appears) ---");
  await new Promise((r) => setTimeout(r, 3000));
  const listResult = parseResult(await handleServices({ action: "list" }));
  const services = listResult.services as Array<{ serviceId: string; name: string }>;
  const ourService = services.find((s) => s.serviceId === serviceId);
  log("total services", services.length);
  assert(!!ourService, `service ${serviceId} should appear in listing`);
  log("found our service", ourService!.name);
  console.log("  PASS");
  console.log();

  // ── Step 10: Pay for service ────────────────────────────────────────────
  // Wait for nonce propagation after service registration UserOp
  await new Promise((r) => setTimeout(r, 5000));
  console.log("--- Step 10: Pay for service (1 call) ---");
  const payResult = parseResult(
    await handlePay({
      action: "pay",
      serviceId,
      calls: 1,
      score: 85,
    }),
  );
  const paymentId = payResult.paymentId as string;
  log("paymentId", paymentId);
  log("txHash", payResult.txHash);
  log("totalCost", `${payResult.totalCost} USDC`);
  assert(payResult.success === true, "pay should succeed");
  console.log("  PASS");
  console.log();

  // ── Step 11: Verify payment ─────────────────────────────────────────────
  console.log("--- Step 11: Verify payment ---");
  if (paymentId && paymentId !== "query-from-tx") {
    await new Promise((r) => setTimeout(r, 3000));
    const verifyResult = parseResult(
      await handlePay({ action: "verify", paymentId }),
    );
    log("valid", verifyResult.valid);
    log("payer", verifyResult.payer);
    log("amount", `${verifyResult.amount} USDC`);
    assert(verifyResult.valid === true, "payment should be valid");
    console.log("  PASS");
  } else {
    console.log("  SKIP: paymentId not extracted from event (query-from-tx)");
  }
  console.log();

  // ── Step 12: Invest in own pool ─────────────────────────────────────────
  console.log(`--- Step 12: Invest ${INVEST_AMOUNT} USDC in own pool ---`);
  const investResult = parseResult(
    await handlePool({
      action: "invest",
      targetAgentId: agentId,
      amount: INVEST_AMOUNT,
    }),
  );
  log("txHash", investResult.txHash);
  log("userOpHash", investResult.userOpHash);
  log("targetPoolAddress", investResult.targetPoolAddress);
  assert(investResult.success === true, "invest should succeed");
  console.log("  PASS");
  console.log();

  // ── Step 13: Final balances ─────────────────────────────────────────────
  console.log("--- Step 13: Final balances ---");
  await new Promise((r) => setTimeout(r, 3000));
  const finalBalance = parseResult(
    await handleWallet({ action: "getBalance" }),
  );
  log("smartAccount USDC", `${finalBalance.usdcBalance} USDC`);
  log("EOA ETH", `${finalBalance.ethBalance} ETH`);
  console.log();

  // ── Summary ─────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`=== E2E Test PASSED (${elapsed}s) ===`);
  console.log(`  agentId:      ${agentId}`);
  console.log(`  smartAccount: ${smartAccount}`);
  console.log(`  poolAddress:  ${poolAddress}`);
  console.log(`  serviceId:    ${serviceId}`);
  console.log(`  paymentId:    ${paymentId}`);
}

main().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
