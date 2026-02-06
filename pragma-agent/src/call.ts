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
  DEFAULT_PROXY_URL,
} from "./config.js";
import { loadOrCreateWallet, requireRegistration } from "./wallet.js";
import { sendUserOp, buildApproveCall, buildPayForServiceCall } from "./userop.js";

// ─── Tool handler ────────────────────────────────────────────────────────────

export interface CallInput {
  action: "call";
  /** The bytes32 serviceId to pay for and call. Required. */
  serviceId: string;
  /** HTTP method: GET or POST. Defaults to GET. */
  method?: string;
  /** Optional JSON body for POST requests. */
  body?: string;
  /** Number of calls to pay for. Defaults to 1. */
  calls?: number;
  /** Proxy base URL. Defaults to http://localhost:4402 */
  proxyUrl?: string;
  /** Optional: additional HTTP headers as a JSON object. */
  headers?: Record<string, string>;
  /** Optional: override RPC URL */
  rpcUrl?: string;
}

export async function handleCall(input: CallInput): Promise<string> {
  try {
    if (input.action !== "call") {
      return JSON.stringify({
        error: `Unknown action: ${input.action}. This tool only supports the 'call' action.`,
      });
    }

    if (!input.serviceId) {
      return JSON.stringify({
        error: "serviceId is required for 'call' action.",
      });
    }

    const rpcUrl = input.rpcUrl ?? RPC_URL;
    const proxyUrl = input.proxyUrl ?? DEFAULT_PROXY_URL;
    const method = (input.method ?? "GET").toUpperCase();
    const calls = input.calls ?? 1;

    if (calls <= 0) {
      return JSON.stringify({ error: "calls must be a positive integer." });
    }

    // Get registration (smart account) and wallet (operator private key)
    const registration = requireRegistration();
    const walletData = loadOrCreateWallet();

    // ── Step 1: Look up service to calculate cost ────────────────────────

    const provider = new JsonRpcProvider(rpcUrl);
    const registry = new Contract(SERVICE_REGISTRY_ADDRESS, SERVICE_REGISTRY_ABI, provider);
    const service = await registry.getService(input.serviceId);

    if (!service.active) {
      return JSON.stringify({
        error: `Service ${input.serviceId} is not active.`,
      });
    }

    const pricePerCall: bigint = service.pricePerCall;
    const totalCost = pricePerCall * BigInt(calls);

    // ── Step 2: Check balance on the smart account ─────────────────────

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

    // ── Step 3: Approve + Pay via single UserOp batch ──────────────────

    const result = await sendUserOp(
      registration.smartAccount as `0x${string}`,
      walletData.privateKey as `0x${string}`,
      [
        buildApproveCall(
          USDC_ADDRESS as `0x${string}`,
          X402_GATEWAY_ADDRESS as `0x${string}`,
          totalCost
        ),
        buildPayForServiceCall(
          input.serviceId as `0x${string}`,
          BigInt(calls)
        ),
      ]
    );

    if (!result.success) {
      return JSON.stringify({
        error: "UserOp failed on-chain.",
        txHash: result.txHash,
        userOpHash: result.userOpHash,
      });
    }

    // ── Step 4: Extract paymentId from the transaction receipt ──────────

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

    if (!paymentId) {
      return JSON.stringify({
        error: "Payment UserOp succeeded but could not extract paymentId from event logs.",
        txHash: result.txHash,
        userOpHash: result.userOpHash,
      });
    }

    // ── Step 5: Call the proxy with x-payment-id header ────────────────

    const url = `${proxyUrl}/proxy/${input.serviceId}`;
    const fetchHeaders: Record<string, string> = {
      "x-payment-id": paymentId,
      "Content-Type": "application/json",
      ...(input.headers ?? {}),
    };

    const fetchOptions: RequestInit = {
      method,
      headers: fetchHeaders,
    };

    if (method === "POST" && input.body) {
      fetchOptions.body = input.body;
    }

    const response = await fetch(url, fetchOptions);
    const responseStatus = response.status;

    let responseBody: string;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = await response.json();
      responseBody = JSON.stringify(json);
    } else {
      responseBody = await response.text();
    }

    return JSON.stringify({
      success: true,
      action: "call",
      serviceId: input.serviceId,
      serviceName: service.name as string,
      paymentId,
      calls,
      totalCost: formatUnits(totalCost, USDC_DECIMALS),
      txHash: result.txHash,
      userOpHash: result.userOpHash,
      payer: registration.smartAccount,
      proxyUrl: url,
      httpMethod: method,
      httpStatus: responseStatus,
      response: responseBody,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

// ─── Tool schema ─────────────────────────────────────────────────────────────

export const callSchema = {
  name: "pragma-call",
  description:
    "One-step pay-and-call via 4337 UserOperation: approves USDC and pays for service through the AgentSmartAccount, then makes an HTTP request to the proxy with the paymentId. Returns the API response.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["call"],
        description: "Must be 'call'. This tool performs a combined pay + HTTP call.",
      },
      serviceId: {
        type: "string" as const,
        description:
          "The bytes32 service identifier to pay for and call. Required.",
      },
      method: {
        type: "string" as const,
        enum: ["GET", "POST"],
        description: "HTTP method for the proxy call. Defaults to 'GET'.",
      },
      body: {
        type: "string" as const,
        description:
          "JSON body for POST requests. Must be a valid JSON string.",
      },
      calls: {
        type: "number" as const,
        description: "Number of API calls to pay for. Defaults to 1.",
      },
      proxyUrl: {
        type: "string" as const,
        description:
          "Base URL of the PragmaMoney proxy. Defaults to 'http://localhost:4402'.",
      },
      headers: {
        type: "object" as const,
        description: "Additional HTTP headers to send with the proxy request.",
      },
      rpcUrl: {
        type: "string" as const,
        description: "Override the default Base Sepolia RPC URL.",
      },
    },
    required: ["action", "serviceId"],
  },
};
