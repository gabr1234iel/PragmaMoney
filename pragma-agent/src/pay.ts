import { Contract, formatUnits, JsonRpcProvider } from "ethers";
import {
  RPC_URL,
  USDC_ADDRESS,
  USDC_DECIMALS,
  X402_GATEWAY_ADDRESS,
  X402_GATEWAY_ABI,
  ERC20_ABI,
  SERVICE_REGISTRY_ADDRESS,
  SERVICE_REGISTRY_ABI,
  REPUTATION_REPORTER_ADDRESS,
} from "./config.js";
import { loadOrCreateWallet, requireRegistration } from "./wallet.js";
import {
  sendUserOp,
  buildApproveCall,
  buildPayForServiceCall,
  buildReputationFeedbackCall,
} from "./userop.js";
import { keccak256, stringToHex, isHex } from "viem";

// ─── Tool handler ────────────────────────────────────────────────────────────

export interface PayInput {
  action: "pay" | "verify";
  /** The bytes32 serviceId to pay for. Required for 'pay' action. */
  serviceId?: string;
  /** Number of calls to pay for. Required for 'pay'. Defaults to 1. */
  calls?: number;
  /** The bytes32 paymentId to verify. Required for 'verify' action. */
  paymentId?: string;
  /** Optional: override RPC URL */
  rpcUrl?: string;
  /** Reputation score 0-100 to submit after payment (required for pay). */
  score?: number;
}

export async function handlePay(input: PayInput): Promise<string> {
  try {
    const rpcUrl = input.rpcUrl ?? RPC_URL;

    switch (input.action) {
      case "pay": {
        if (!input.serviceId) {
          return JSON.stringify({
            error: "serviceId is required for 'pay' action.",
          });
        }

        if (input.score === undefined || input.score === null) {
          return JSON.stringify({
            error: "score is required for 'pay' action.",
          });
        }

        const calls = input.calls ?? 1;
        if (calls <= 0) {
          return JSON.stringify({ error: "calls must be a positive integer." });
        }

        // Get registration (smart account) and wallet (operator private key)
        const registration = requireRegistration();
        const walletData = loadOrCreateWallet();

        // Look up the service to calculate total cost
        const provider = new JsonRpcProvider(rpcUrl);
        const registry = new Contract(SERVICE_REGISTRY_ADDRESS, SERVICE_REGISTRY_ABI, provider);
        const service = await registry.getService(input.serviceId);
        const agentId: bigint = await registry.getAgentId(input.serviceId);

        if (!service.active) {
          return JSON.stringify({
            error: `Service ${input.serviceId} is not active.`,
          });
        }

        const pricePerCall: bigint = service.pricePerCall;
        const totalCost = pricePerCall * BigInt(calls);

        // Check USDC balance on the smart account (not EOA)
        const usdc = new Contract(USDC_ADDRESS, ERC20_ABI, provider);
        const balance: bigint = await usdc.balanceOf(registration.smartAccount);

        if (balance < totalCost) {
          return JSON.stringify({
            error: `Insufficient USDC balance. Need ${formatUnits(totalCost, USDC_DECIMALS)} USDC but smart account has ${formatUnits(balance, USDC_DECIMALS)} USDC.`,
            required: formatUnits(totalCost, USDC_DECIMALS),
            available: formatUnits(balance, USDC_DECIMALS),
            smartAccount: registration.smartAccount,
          });
        }

        // Send two sequential UserOps:
        // 1. Approve USDC on gateway
        // 2. payForService
        // (Batching as executeBatch causes AA23 on deployed smart account)
        // skipSponsorship: smart account pays gas (Pimlico paymaster doesn't work with custom _validateUserOp)
        await sendUserOp(
          registration.smartAccount as `0x${string}`,
          walletData.privateKey as `0x${string}`,
          [
            buildApproveCall(
              USDC_ADDRESS as `0x${string}`,
              X402_GATEWAY_ADDRESS as `0x${string}`,
              totalCost
            ),
          ],
          { skipSponsorship: true }
        );

        const result = await sendUserOp(
          registration.smartAccount as `0x${string}`,
          walletData.privateKey as `0x${string}`,
          [
            buildPayForServiceCall(
              input.serviceId as `0x${string}`,
              BigInt(calls)
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

        let reputationTx: string | null = null;
        const scoreNum = Number(input.score);
        if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
          return JSON.stringify({ error: "score must be between 0 and 100" });
        }
        if (!REPUTATION_REPORTER_ADDRESS) {
          return JSON.stringify({ error: "REPUTATION_REPORTER_ADDRESS is not configured" });
        }

        const tag1 = "score";
        const tag2 = "payment";
        const endpoint = "";
        const feedbackURI = "";
        const payload = JSON.stringify({
          serviceId: input.serviceId,
          agentId: agentId.toString(),
          score: scoreNum,
          tag1,
          tag2,
        });
        const feedbackHash = keccak256(stringToHex(payload));

        const repResult = await sendUserOp(
          registration.smartAccount as `0x${string}`,
          walletData.privateKey as `0x${string}`,
          [
            buildReputationFeedbackCall(
              REPUTATION_REPORTER_ADDRESS as `0x${string}`,
              agentId,
              BigInt(scoreNum),
              0,
              tag1,
              tag2,
              endpoint,
              feedbackURI,
              feedbackHash as `0x${string}`
            ),
          ],
          { skipSponsorship: true }
        );

        if (!repResult.success) {
          return JSON.stringify({
            error: "Reputation UserOp failed on-chain.",
            txHash: repResult.txHash,
            userOpHash: repResult.userOpHash,
          });
        }
        reputationTx = repResult.txHash;

        // Extract paymentId from the ServicePaid event in the transaction receipt
        let paymentId: string | null = null;
        const txReceipt = await provider.getTransactionReceipt(result.txHash);
        if (txReceipt) {
          const gateway = new Contract(X402_GATEWAY_ADDRESS, X402_GATEWAY_ABI, provider);
          for (const log of txReceipt.logs) {
            try {
              const parsed = gateway.interface.parseLog({
                topics: log.topics as string[],
                data: log.data,
              });
              if (parsed && parsed.name === "ServicePaid") {
                paymentId = parsed.args.paymentId;
                break;
              }
            } catch {
              // Not a gateway event, skip
            }
          }
        }

        return JSON.stringify({
          success: true,
          action: "pay",
          serviceId: input.serviceId,
          serviceName: service.name as string,
          calls,
          totalCost: formatUnits(totalCost, USDC_DECIMALS),
          totalCostRaw: totalCost.toString(),
          paymentId: paymentId ?? "query-from-tx",
          txHash: result.txHash,
          userOpHash: result.userOpHash,
          payer: registration.smartAccount,
          agentId: agentId.toString(),
          reputationTx,
        });
      }

      case "verify": {
        if (!input.paymentId) {
          return JSON.stringify({
            error: "paymentId is required for 'verify' action.",
          });
        }

        const provider = new JsonRpcProvider(rpcUrl);
        const gateway = new Contract(X402_GATEWAY_ADDRESS, X402_GATEWAY_ABI, provider);

        const [valid, payer, amount] = await gateway.verifyPayment(input.paymentId);

        return JSON.stringify({
          paymentId: input.paymentId,
          valid: valid as boolean,
          payer: payer as string,
          amount: formatUnits(amount as bigint, USDC_DECIMALS),
          amountRaw: (amount as bigint).toString(),
        });
      }

      default:
        return JSON.stringify({
          error: `Unknown action: ${input.action}. Valid actions: pay, verify`,
        });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

// ─── Tool schema ─────────────────────────────────────────────────────────────

export const paySchema = {
  name: "pragma-pay",
  description:
    "Pay for PragmaMoney services on-chain via the x402Gateway using a 4337 UserOperation. Approves USDC and calls payForService through the AgentSmartAccount to get a paymentId, or verifies an existing payment.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["pay", "verify"],
        description: "The payment action to perform.",
      },
      serviceId: {
        type: "string" as const,
        description:
          "The bytes32 service identifier. Required for 'pay' action.",
      },
      calls: {
        type: "number" as const,
        description:
          "Number of API calls to pay for. Defaults to 1. Required for 'pay' action.",
      },
      paymentId: {
        type: "string" as const,
        description:
          "The bytes32 payment identifier to verify. Required for 'verify' action.",
      },
      score: {
        type: "number" as const,
        description:
          "Required reputation score (0-100) to submit after a successful payment.",
      },
      rpcUrl: {
        type: "string" as const,
        description: "Override the default Base Sepolia RPC URL.",
      },
    },
    required: ["action"],
  },
};
