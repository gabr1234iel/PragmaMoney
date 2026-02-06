import { JsonRpcProvider, Contract, formatUnits, parseUnits } from "ethers";
import {
  RPC_URL,
  USDC_DECIMALS,
  AGENT_POOL_ABI,
} from "./config.js";
import { loadOrCreateWallet, requireRegistration, getRegistration } from "./wallet.js";
import { sendUserOp, buildPoolPullCall } from "./userop.js";

// ─── Tool handler ────────────────────────────────────────────────────────────

export interface PoolInput {
  action: "pull" | "remaining" | "info";
  /** Address of the AgentPool contract. Optional if agent is registered (uses registration poolAddress). */
  poolAddress?: string;
  /** Recipient address for 'pull'. Defaults to the agent's smart account address. */
  to?: string;
  /** Amount of USDC to pull (human-readable, e.g. "10.5"). Required for 'pull'. */
  amount?: string;
  /** Optional: override RPC URL */
  rpcUrl?: string;
}

export async function handlePool(input: PoolInput): Promise<string> {
  try {
    const rpcUrl = input.rpcUrl ?? RPC_URL;

    switch (input.action) {
      case "info": {
        const poolAddr = input.poolAddress || getRegistration()?.poolAddress;
        if (!poolAddr) {
          return JSON.stringify({
            error: "poolAddress is required. Either register the agent first (pragma-register) or provide poolAddress explicitly.",
          });
        }

        const provider = new JsonRpcProvider(rpcUrl);
        const pool = new Contract(poolAddr, AGENT_POOL_ABI, provider);

        const [
          totalAssets,
          dailyCap,
          agentId,
          spentToday,
          currentDay,
          agentRevoked,
          metadataURI,
          assetAddress,
          poolName,
          poolSymbol,
          allowlistEnabled,
        ] = await Promise.all([
          pool.totalAssets(),
          pool.dailyCap(),
          pool.agentId(),
          pool.spentToday(),
          pool.currentDay(),
          pool.agentRevoked(),
          pool.metadataURI(),
          pool.asset(),
          pool.name(),
          pool.symbol(),
          pool.allowlistEnabled(),
        ]);

        return JSON.stringify({
          poolAddress: poolAddr,
          name: poolName as string,
          symbol: poolSymbol as string,
          assetAddress: assetAddress as string,
          totalAssets: formatUnits(totalAssets as bigint, USDC_DECIMALS),
          totalAssetsRaw: (totalAssets as bigint).toString(),
          dailyCap: formatUnits(dailyCap as bigint, USDC_DECIMALS),
          dailyCapRaw: (dailyCap as bigint).toString(),
          agentId: (agentId as bigint).toString(),
          spentToday: formatUnits(spentToday as bigint, USDC_DECIMALS),
          spentTodayRaw: (spentToday as bigint).toString(),
          currentDay: Number(currentDay),
          agentRevoked: agentRevoked as boolean,
          metadataURI: metadataURI as string,
          allowlistEnabled: allowlistEnabled as boolean,
        });
      }

      case "remaining": {
        const poolAddr = input.poolAddress || getRegistration()?.poolAddress;
        if (!poolAddr) {
          return JSON.stringify({
            error: "poolAddress is required. Either register the agent first (pragma-register) or provide poolAddress explicitly.",
          });
        }

        const provider = new JsonRpcProvider(rpcUrl);
        const pool = new Contract(poolAddr, AGENT_POOL_ABI, provider);

        const remaining: bigint = await pool.remainingCapToday();
        const dailyCap: bigint = await pool.dailyCap();

        return JSON.stringify({
          poolAddress: poolAddr,
          remainingCapToday: formatUnits(remaining, USDC_DECIMALS),
          remainingCapTodayRaw: remaining.toString(),
          dailyCap: formatUnits(dailyCap, USDC_DECIMALS),
          dailyCapRaw: dailyCap.toString(),
        });
      }

      case "pull": {
        if (!input.amount) {
          return JSON.stringify({
            error: "amount is required for 'pull' action (USDC amount, e.g. '10.5').",
          });
        }

        // Get registration (smart account + pool address) and wallet (operator private key)
        const registration = requireRegistration();
        const walletData = loadOrCreateWallet();
        const poolAddr = input.poolAddress ?? registration.poolAddress;

        if (!poolAddr) {
          return JSON.stringify({
            error: "poolAddress is required. Either register the agent with a pool first or provide poolAddress explicitly.",
          });
        }

        const assets = parseUnits(input.amount, USDC_DECIMALS);

        // Check remaining cap before attempting (read-only)
        const provider = new JsonRpcProvider(rpcUrl);
        const pool = new Contract(poolAddr, AGENT_POOL_ABI, provider);
        const remaining: bigint = await pool.remainingCapToday();
        if (assets > remaining) {
          return JSON.stringify({
            error: `Requested ${input.amount} USDC but only ${formatUnits(remaining, USDC_DECIMALS)} USDC remaining in today's cap.`,
            remainingCapToday: formatUnits(remaining, USDC_DECIMALS),
          });
        }

        // Pull USDC into the smart account
        const to = registration.smartAccount;

        // Send UserOp: pool.pull(to, assets) through the smart account
        // skipSponsorship: smart account pays gas from its own ETH balance
        // (Pimlico paymaster doesn't work with custom _validateUserOp)
        const result = await sendUserOp(
          registration.smartAccount as `0x${string}`,
          walletData.privateKey as `0x${string}`,
          [
            buildPoolPullCall(
              poolAddr as `0x${string}`,
              to as `0x${string}`,
              assets
            ),
          ],
          { skipSponsorship: true }
        );

        if (!result.success) {
          return JSON.stringify({
            error: "UserOp failed on-chain.",
            txHash: result.txHash,
            userOpHash: result.userOpHash,
          });
        }

        return JSON.stringify({
          success: true,
          action: "pull",
          to,
          amount: input.amount,
          amountRaw: assets.toString(),
          poolAddress: poolAddr,
          txHash: result.txHash,
          userOpHash: result.userOpHash,
        });
      }

      default:
        return JSON.stringify({
          error: `Unknown action: ${input.action}. Valid actions: pull, remaining, info`,
        });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

// ─── Tool schema ─────────────────────────────────────────────────────────────

export const poolSchema = {
  name: "pragma-pool",
  description:
    "Interact with a PragmaMoney AgentPool (ERC-4626 vault) via 4337 UserOperations. Pull USDC from the pool into the smart account, check remaining daily cap, or get pool metadata.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["pull", "remaining", "info"],
        description: "The pool action to perform.",
      },
      poolAddress: {
        type: "string" as const,
        description:
          "Address of the AgentPool contract. Optional if agent is registered (defaults to registration poolAddress).",
      },
      to: {
        type: "string" as const,
        description:
          "Recipient address for 'pull' action. Defaults to the agent's smart account address.",
      },
      amount: {
        type: "string" as const,
        description:
          "Amount of USDC to pull (human-readable, e.g. '10.5'). Required for 'pull' action.",
      },
      rpcUrl: {
        type: "string" as const,
        description: "Override the default Base Sepolia RPC URL.",
      },
    },
    required: ["action"],
  },
};
