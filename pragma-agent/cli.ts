#!/usr/bin/env node

/**
 * pragma-agent CLI
 *
 * Usage:
 *   pragma-agent register --name "X" --endpoint "https://..." --daily-limit 100 --expiry-days 90 --pool-daily-cap 50
 *   pragma-agent wallet [balance|address|policy]
 *   pragma-agent services [list|get --service-id 0x...|search --query "keyword"]
 *   pragma-agent pool [info|remaining|pull --amount 5.00]
 *   pragma-agent pay [pay --service-id 0x... --calls 1|verify --payment-id 0x...]
 *   pragma-agent call --service-id 0x... [--method POST] [--body '{"key":"val"}']
 */

import { handleRegister } from "./src/register.js";
import type { RegisterInput } from "./src/register.js";
import { handleWallet } from "./src/wallet.js";
import type { WalletInput } from "./src/wallet.js";
import { handleServices } from "./src/services.js";
import type { ServicesInput } from "./src/services.js";
import { handlePool } from "./src/pool.js";
import type { PoolInput } from "./src/pool.js";
import { handlePay } from "./src/pay.js";
import type { PayInput } from "./src/pay.js";
import { handleCall } from "./src/call.js";
import type { CallInput } from "./src/call.js";

// ─── Arg parsing helpers ─────────────────────────────────────────────────────

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function getFlagNum(args: string[], name: string): number | undefined {
  const val = getFlag(args, name);
  if (val === undefined) return undefined;
  const num = Number(val);
  if (isNaN(num)) {
    console.error(JSON.stringify({ error: `Invalid number for --${name}: ${val}` }));
    process.exit(1);
  }
  return num;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1] && !args[1].startsWith("--") ? args[1] : undefined;

  if (!command || command === "--help" || command === "-h") {
    console.log(`pragma-agent — PragmaMoney CLI for AI agents

Commands:
  register   Register agent: identity NFT, smart wallet, pool
  wallet     Manage wallet: balance, address, policy
  services   Browse ServiceRegistry: list, get, search
  pool       AgentPool: info, remaining, pull
  pay        Pay for services: pay, verify
  call       One-step pay + HTTP call

Examples:
  pragma-agent register --name "MyAgent" --endpoint "https://myagent.com" --daily-limit 100 --expiry-days 90 --pool-daily-cap 50
  pragma-agent wallet balance
  pragma-agent wallet policy
  pragma-agent services list
  pragma-agent services get --service-id 0x...
  pragma-agent pool remaining
  pragma-agent pool pull --amount 5.00
  pragma-agent pay pay --service-id 0x... --calls 1
  pragma-agent pay verify --payment-id 0x...
  pragma-agent call --service-id 0x... --method POST --body '{"key":"val"}'

Environment:
  PIMLICO_API_KEY   Pimlico bundler API key (required for UserOps)
  RELAYER_URL       Proxy relayer URL (default: http://localhost:4402)`);
    process.exit(0);
  }

  let result: string;

  switch (command) {
    case "register": {
      const name = getFlag(args, "name");
      const endpoint = getFlag(args, "endpoint");
      const dailyLimit = getFlag(args, "daily-limit");
      const expiryDays = getFlagNum(args, "expiry-days");
      const poolDailyCap = getFlag(args, "pool-daily-cap");
      const poolVestingDays = getFlagNum(args, "pool-vesting-days");
      const relayerUrl = getFlag(args, "relayer-url");
      const description = getFlag(args, "description");

      if (!name || !endpoint || !dailyLimit || expiryDays === undefined || !poolDailyCap) {
        console.error(JSON.stringify({
          error: "Missing required flags: --name, --endpoint, --daily-limit, --expiry-days, --pool-daily-cap",
        }));
        process.exit(1);
      }

      const input: RegisterInput = {
        action: "register",
        name,
        endpoint,
        dailyLimit,
        expiryDays,
        poolDailyCap,
        ...(description !== undefined && { description }),
        ...(poolVestingDays !== undefined && { poolVestingDays }),
        ...(relayerUrl !== undefined && { relayerUrl }),
      };
      result = await handleRegister(input);
      break;
    }

    case "wallet": {
      const action = (subcommand ?? "balance") as WalletInput["action"];
      const validActions = ["getBalance", "getAddress", "getPolicy", "balance", "address", "policy"];
      // Allow shorthand: balance → getBalance, address → getAddress, policy → getPolicy
      const actionMap: Record<string, WalletInput["action"]> = {
        balance: "getBalance",
        address: "getAddress",
        policy: "getPolicy",
        getBalance: "getBalance",
        getAddress: "getAddress",
        getPolicy: "getPolicy",
      };
      const mappedAction = actionMap[action];
      if (!mappedAction) {
        console.error(JSON.stringify({
          error: `Unknown wallet action: ${action}. Valid: ${validActions.join(", ")}`,
        }));
        process.exit(1);
      }

      const input: WalletInput = {
        action: mappedAction,
        ...(getFlag(args, "smart-account") !== undefined && { smartAccountAddress: getFlag(args, "smart-account") }),
        ...(getFlag(args, "rpc-url") !== undefined && { rpcUrl: getFlag(args, "rpc-url") }),
      };
      result = await handleWallet(input);
      break;
    }

    case "services": {
      const action = (subcommand ?? "list") as ServicesInput["action"];
      if (!["list", "get", "search"].includes(action)) {
        console.error(JSON.stringify({
          error: `Unknown services action: ${action}. Valid: list, get, search`,
        }));
        process.exit(1);
      }

      const input: ServicesInput = {
        action,
        ...(getFlag(args, "service-id") !== undefined && { serviceId: getFlag(args, "service-id") }),
        ...(getFlag(args, "query") !== undefined && { query: getFlag(args, "query") }),
        ...(getFlag(args, "rpc-url") !== undefined && { rpcUrl: getFlag(args, "rpc-url") }),
      };
      result = await handleServices(input);
      break;
    }

    case "pool": {
      const action = (subcommand ?? "info") as PoolInput["action"];
      if (!["pull", "remaining", "info"].includes(action)) {
        console.error(JSON.stringify({
          error: `Unknown pool action: ${action}. Valid: pull, remaining, info`,
        }));
        process.exit(1);
      }

      const input: PoolInput = {
        action,
        ...(getFlag(args, "pool-address") !== undefined && { poolAddress: getFlag(args, "pool-address") }),
        ...(getFlag(args, "amount") !== undefined && { amount: getFlag(args, "amount") }),
        ...(getFlag(args, "rpc-url") !== undefined && { rpcUrl: getFlag(args, "rpc-url") }),
      };
      result = await handlePool(input);
      break;
    }

    case "pay": {
      const action = (subcommand ?? "pay") as PayInput["action"];
      if (!["pay", "verify"].includes(action)) {
        console.error(JSON.stringify({
          error: `Unknown pay action: ${action}. Valid: pay, verify`,
        }));
        process.exit(1);
      }

      const input: PayInput = {
        action,
        ...(getFlag(args, "service-id") !== undefined && { serviceId: getFlag(args, "service-id") }),
        ...(getFlagNum(args, "calls") !== undefined && { calls: getFlagNum(args, "calls") }),
        ...(getFlag(args, "payment-id") !== undefined && { paymentId: getFlag(args, "payment-id") }),
        ...(getFlag(args, "rpc-url") !== undefined && { rpcUrl: getFlag(args, "rpc-url") }),
      };
      result = await handlePay(input);
      break;
    }

    case "call": {
      const serviceId = getFlag(args, "service-id");
      if (!serviceId) {
        console.error(JSON.stringify({
          error: "Missing required flag: --service-id",
        }));
        process.exit(1);
      }

      const input: CallInput = {
        action: "call",
        serviceId,
        ...(getFlag(args, "method") !== undefined && { method: getFlag(args, "method") }),
        ...(getFlag(args, "body") !== undefined && { body: getFlag(args, "body") }),
        ...(getFlagNum(args, "calls") !== undefined && { calls: getFlagNum(args, "calls") }),
        ...(getFlag(args, "proxy-url") !== undefined && { proxyUrl: getFlag(args, "proxy-url") }),
        ...(getFlag(args, "rpc-url") !== undefined && { rpcUrl: getFlag(args, "rpc-url") }),
      };
      result = await handleCall(input);
      break;
    }

    default:
      console.error(JSON.stringify({
        error: `Unknown command: ${command}. Valid: register, wallet, services, pool, pay, call`,
      }));
      process.exit(1);
  }

  // Print result and exit
  console.log(result);
  const parsed = JSON.parse(result);
  process.exit(parsed.error ? 1 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
