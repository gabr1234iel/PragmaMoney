import { JsonRpcProvider, Contract, formatUnits, parseUnits } from "ethers";
import {
  RPC_URL,
  USDC_ADDRESS,
  USDC_DECIMALS,
  AGENT_POOL_ABI,
  ERC20_ABI,
  AGENT_POOL_FACTORY_ADDRESS,
  AGENT_POOL_FACTORY_ABI,
  RELAYER_URL,
} from "./config.js";
import { loadOrCreateWallet, requireRegistration, getRegistration } from "./wallet.js";
import { sendUserOp, buildPoolPullCall, buildApproveCall, buildPoolDepositCall } from "./userop.js";

// ─── Tool handler ────────────────────────────────────────────────────────────

export interface PoolInput {
  action: "pull" | "remaining" | "info" | "invest";
  /** Address of the AgentPool contract. Optional if agent is registered (uses registration poolAddress). */
  poolAddress?: string;
  /** Recipient address for 'pull'. Defaults to the agent's smart account address. */
  to?: string;
  /** Amount of USDC to pull/invest (human-readable, e.g. "10.5"). Required for 'pull' and 'invest'. */
  amount?: string;
  /** Target agent ID for 'invest'. Deposits into that agent's pool. */
  targetAgentId?: string;
  /** Optional: override relayer URL */
  relayerUrl?: string;
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

      case "invest": {
        if (!input.amount) {
          return JSON.stringify({
            error: "amount is required for 'invest' action (USDC amount, e.g. '1.0').",
          });
        }
        if (!input.targetAgentId) {
          return JSON.stringify({
            error: "targetAgentId is required for 'invest' action.",
          });
        }

        // Get registration (smart account) and wallet (operator private key)
        const registration = requireRegistration();
        const walletData = loadOrCreateWallet();
        const relayerUrl = input.relayerUrl ?? RELAYER_URL;

        // Look up target pool via AgentFactory.poolByAgentId on-chain
        const provider = new JsonRpcProvider(rpcUrl);
        const agentFactory = new Contract(
          AGENT_POOL_FACTORY_ADDRESS,
          AGENT_POOL_FACTORY_ABI,
          provider,
        );

        const targetPoolAddress: string = await agentFactory.poolByAgentId(
          BigInt(input.targetAgentId),
        );

        if (!targetPoolAddress || targetPoolAddress === "0x0000000000000000000000000000000000000000") {
          return JSON.stringify({
            error: `No pool found for agentId ${input.targetAgentId}. Agent may not have created a pool yet.`,
          });
        }

        // Request deployer to allow target pool on our smart account (transparent)
        try {
          const allowRes = await fetch(`${relayerUrl}/allow-target`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operatorAddress: walletData.address,
              agentId: registration.agentId,
              targetAddress: targetPoolAddress,
            }),
          });
          if (!allowRes.ok) {
            const err = await allowRes.json() as { error?: string; details?: string };
            return JSON.stringify({
              error: `Failed to allow target pool: ${err.error ?? allowRes.statusText}`,
              details: err.details,
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return JSON.stringify({
            error: `Failed to reach relayer for target approval: ${msg}`,
          });
        }

        const assets = parseUnits(input.amount, USDC_DECIMALS);

        // Check smart account USDC balance
        const usdc = new Contract(USDC_ADDRESS, ERC20_ABI, provider);
        const balance: bigint = await usdc.balanceOf(registration.smartAccount);
        if (balance < assets) {
          return JSON.stringify({
            error: `Insufficient USDC balance. Need ${input.amount} USDC but smart account has ${formatUnits(balance, USDC_DECIMALS)} USDC.`,
            required: input.amount,
            available: formatUnits(balance, USDC_DECIMALS),
          });
        }

        // Send UserOp batch: approve USDC on target pool + pool.deposit(assets, smartAccount)
        const result = await sendUserOp(
          registration.smartAccount as `0x${string}`,
          walletData.privateKey as `0x${string}`,
          [
            buildApproveCall(
              USDC_ADDRESS as `0x${string}`,
              targetPoolAddress as `0x${string}`,
              assets,
            ),
            buildPoolDepositCall(
              targetPoolAddress as `0x${string}`,
              assets,
              registration.smartAccount as `0x${string}`,
            ),
          ],
          { skipSponsorship: true },
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
          action: "invest",
          targetAgentId: input.targetAgentId,
          targetPoolAddress,
          amount: input.amount,
          amountRaw: assets.toString(),
          txHash: result.txHash,
          userOpHash: result.userOpHash,
        });
      }

      default:
        return JSON.stringify({
          error: `Unknown action: ${input.action}. Valid actions: pull, remaining, info, invest`,
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
    "Interact with a PragmaMoney AgentPool (ERC-4626 vault) via 4337 UserOperations. Pull USDC from the pool into the smart account, invest USDC into another agent's pool, check remaining daily cap, or get pool metadata.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["pull", "remaining", "info", "invest"],
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
          "Amount of USDC (human-readable, e.g. '10.5'). Required for 'pull' and 'invest' actions.",
      },
      targetAgentId: {
        type: "string" as const,
        description:
          "Agent ID whose pool to invest in. Required for 'invest' action.",
      },
      relayerUrl: {
        type: "string" as const,
        description: "Override the default proxy relayer URL.",
      },
      rpcUrl: {
        type: "string" as const,
        description: "Override the default Base Sepolia RPC URL.",
      },
    },
    required: ["action"],
  },
};
