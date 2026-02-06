/**
 * PragmaMoney OpenClaw Plugin
 *
 * Registers 6 tools for AI agents to interact with PragmaMoney's on-chain services:
 *   1. pragma-register — Register agent: identity NFT, smart wallet, pool (via relayer)
 *   2. pragma-wallet   — Manage wallet: address, balances, spending policy
 *   3. pragma-services — Browse and search the ServiceRegistry
 *   4. pragma-pool     — Pull from AgentPool, check remaining cap, get info
 *   5. pragma-pay      — Pay for services via x402Gateway, verify payments
 *   6. pragma-call     — One-step pay + HTTP call to the proxy
 */

import { registerSchema, handleRegister } from "./src/register.js";
import type { RegisterInput } from "./src/register.js";
import { walletSchema, handleWallet } from "./src/wallet.js";
import type { WalletInput } from "./src/wallet.js";
import { servicesSchema, handleServices } from "./src/services.js";
import type { ServicesInput } from "./src/services.js";
import { poolSchema, handlePool } from "./src/pool.js";
import type { PoolInput } from "./src/pool.js";
import { paySchema, handlePay } from "./src/pay.js";
import type { PayInput } from "./src/pay.js";
import { callSchema, handleCall } from "./src/call.js";
import type { CallInput } from "./src/call.js";

// ─── OpenClaw PluginAPI type ─────────────────────────────────────────────────

interface ToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface PluginAPI {
  registerTool(
    name: string,
    schema: ToolSchema,
    handler: (input: Record<string, unknown>) => Promise<string>
  ): void;
}

// ─── Plugin entry point ──────────────────────────────────────────────────────

export default function register(api: PluginAPI): void {
  // 1. pragma-register
  api.registerTool(
    registerSchema.name,
    registerSchema as unknown as ToolSchema,
    async (input) => handleRegister(input as unknown as RegisterInput)
  );

  // 2. pragma-wallet
  api.registerTool(
    walletSchema.name,
    walletSchema as unknown as ToolSchema,
    async (input) => handleWallet(input as unknown as WalletInput)
  );

  // 3. pragma-services
  api.registerTool(
    servicesSchema.name,
    servicesSchema as unknown as ToolSchema,
    async (input) => handleServices(input as unknown as ServicesInput)
  );

  // 4. pragma-pool
  api.registerTool(
    poolSchema.name,
    poolSchema as unknown as ToolSchema,
    async (input) => handlePool(input as unknown as PoolInput)
  );

  // 5. pragma-pay
  api.registerTool(
    paySchema.name,
    paySchema as unknown as ToolSchema,
    async (input) => handlePay(input as unknown as PayInput)
  );

  // 6. pragma-call
  api.registerTool(
    callSchema.name,
    callSchema as unknown as ToolSchema,
    async (input) => handleCall(input as unknown as CallInput)
  );
}
