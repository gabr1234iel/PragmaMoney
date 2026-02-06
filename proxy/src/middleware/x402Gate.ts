import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ethers } from "ethers";

import { config } from "../config.js";
import { getResource } from "../services/resourceStore.js";
import {
  verifyPayment as facilitatorVerify,
  settlePayment as facilitatorSettle,
  decodePaymentHeader,
} from "../services/facilitator.js";
import {
  createTransaction,
  recordTransaction,
  isPaymentIdUsed,
  markPaymentIdUsed,
} from "../models/Transaction.js";
import type {
  PaymentRequirementsAccept,
  X402ErrorResponse,
} from "../types/x402.js";

// ---------------------------------------------------------------------------
// Gateway ABI (minimal -- only the verifyPayment view function)
// ---------------------------------------------------------------------------

const GATEWAY_ABI = [
  "function verifyPayment(bytes32 paymentId) view returns (bool valid, address payer, uint256 amount)",
  "function getPayment(bytes32 paymentId) view returns (tuple(address payer, bytes32 serviceId, uint256 calls, uint256 amount, uint256 timestamp))",
];

const SERVICE_REGISTRY_ABI = [
  "function recordUsage(bytes32 serviceId, uint256 calls, uint256 revenue) external",
];

const SERVICE_REGISTRY_GETSERVICE_ABI = [
  "function getService(bytes32 serviceId) view returns (tuple(address owner, string name, uint256 pricePerCall, string endpoint, uint8 serviceType, bool active, uint256 totalCalls, uint256 totalRevenue))",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the on-chain owner of a service from ServiceRegistry.
 * Only works for on-chain services (bytes32 hex: 0x + 64 hex chars).
 * Returns null on failure so callers can fall back to resource.creatorAddress.
 */
async function resolveServiceOwner(serviceId: string): Promise<string | null> {
  // Only attempt for on-chain service IDs (bytes32 hex)
  if (!/^0x[0-9a-fA-F]{64}$/.test(serviceId)) {
    return null;
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.gatewayRpcUrl);
    const registry = new ethers.Contract(
      config.serviceRegistryAddress,
      SERVICE_REGISTRY_GETSERVICE_ABI,
      provider
    );

    const service = await registry.getService(serviceId);
    const owner = service.owner as string;

    if (owner && owner !== ethers.ZeroAddress) {
      console.log(`[x402Gate] Resolved on-chain owner for ${serviceId}: ${owner}`);
      return owner;
    }

    return null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[x402Gate] Failed to resolve on-chain owner for ${serviceId}: ${message}`);
    return null;
  }
}

/**
 * Determine whether the current request should be served for free
 * (no payment required).
 */
function isFreeRequest(req: Request): boolean {
  const { method, path } = req;

  // Explicit free routes
  if (method === "GET" && (path === "/health" || path === "/services")) {
    return true;
  }

  // MCP JSON-RPC: initialize and tools/list are free
  if (
    method === "POST" &&
    req.body &&
    typeof req.body === "object" &&
    "method" in req.body
  ) {
    const rpcMethod = (req.body as { method?: string }).method;
    if (rpcMethod === "initialize" || rpcMethod === "tools/list") {
      return true;
    }
  }

  return false;
}

/**
 * Fire-and-forget: call ServiceRegistry.recordUsage() on-chain.
 * Records x402 Path A usage stats without blocking the HTTP response.
 */
function fireRecordUsage(serviceId: string, calls: number, amount: string): void {
  if (!config.proxySignerKey) {
    console.warn("[x402Gate] No PROXY_SIGNER_KEY configured, skipping on-chain recordUsage");
    return;
  }

  // Only call for on-chain services (bytes32 hex: 0x + 64 hex chars)
  if (!/^0x[0-9a-fA-F]{64}$/.test(serviceId)) {
    return;
  }

  const provider = new ethers.JsonRpcProvider(config.gatewayRpcUrl);
  const signer = new ethers.Wallet(config.proxySignerKey, provider);
  const registry = new ethers.Contract(
    config.serviceRegistryAddress,
    SERVICE_REGISTRY_ABI,
    signer
  );

  registry.recordUsage(serviceId, calls, amount)
    .then((tx: ethers.TransactionResponse) => {
      console.log(`[x402Gate] recordUsage tx sent: ${tx.hash}`);
      return tx.wait();
    })
    .then(() => {
      console.log(`[x402Gate] recordUsage confirmed for serviceId=${serviceId}`);
    })
    .catch((err: Error) => {
      console.error(`[x402Gate] recordUsage failed: ${err.message}`);
    });
}

/**
 * Build the standard x402 PaymentRequirementsAccept block for a resource.
 */
function buildAccept(
  resource: { name: string; creatorAddress: string; pricing: { pricePerCall: string } },
  requestUrl: string,
  payToOverride?: string
): PaymentRequirementsAccept {
  // x402-axios requires `resource` to be a full URL
  const fullUrl = requestUrl.startsWith("http")
    ? requestUrl
    : `http://localhost:${config.port}${requestUrl}`;

  return {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: resource.pricing.pricePerCall,
    resource: fullUrl,
    description: resource.name,
    mimeType: "application/json",
    payTo: payToOverride ?? resource.creatorAddress,
    maxTimeoutSeconds: 60,
    asset: config.usdcAddress,
    extra: { name: "USDC", version: "2" },
  };
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create an Express middleware that enforces dual payment verification.
 *
 * Path A  -- `x-payment` header  (standard x402 for end users)
 * Path B  -- `x-payment-id` header (on-chain gateway paymentId for agents)
 *
 * If neither header is present the middleware responds with HTTP 402 and
 * the requirements that a client needs to fulfil.
 */
export function createX402Gate(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 1. Free routes bypass payment
    if (isFreeRequest(req)) {
      next();
      return;
    }

    // 2. Resolve the resource from the route
    const resourceId = (req.params as Record<string, string>).resourceId;
    if (!resourceId) {
      res.status(400).json({ error: "Missing resourceId in route" });
      return;
    }

    const resource = getResource(resourceId);
    if (!resource) {
      res.status(404).json({ error: `Resource '${resourceId}' not found` });
      return;
    }

    // Resolve on-chain owner for payTo (ensures x402 and gateway paths route to same address)
    const onChainOwner = await resolveServiceOwner(resourceId);
    const accept = buildAccept(resource, req.originalUrl, onChainOwner ?? undefined);

    // ------------------------------------------------------------------
    // Path A: x-payment header (x402 facilitator for end users)
    // ------------------------------------------------------------------
    const paymentHeader = req.headers["x-payment"] as string | undefined;
    if (paymentHeader) {
      try {
        // Decode the base64-encoded X-PAYMENT header into a typed object
        let decodedPayload;
        try {
          decodedPayload = decodePaymentHeader(paymentHeader);
        } catch {
          res.status(400).json({ error: "Malformed X-PAYMENT header" });
          return;
        }

        console.log(`[x402Gate] Decoded payment: scheme=${decodedPayload.scheme}, network=${decodedPayload.network}, from=${decodedPayload.payload?.authorization?.from}`);

        // Verify (pass decoded payload + single accept requirement)
        const verifyResult = await facilitatorVerify(decodedPayload, accept);

        if (!verifyResult.valid) {
          res.status(402).json({
            error: "Payment verification failed",
            reason: verifyResult.invalidReason,
          });
          return;
        }

        // Settle
        const settleResult = await facilitatorSettle(decodedPayload, accept);

        if (!settleResult.success) {
          res.status(402).json({
            error: "Payment settlement failed",
            reason: settleResult.error,
          });
          return;
        }

        // Set response header so the client knows settlement succeeded
        if (settleResult.txHash) {
          res.setHeader("X-PAYMENT-RESPONSE", settleResult.txHash);
        }

        // Record audit trail
        const payer = decodedPayload.payload?.authorization?.from ?? "x402-user";
        const tx = createTransaction({
          resourceId: resource.id,
          payer,
          amount: resource.pricing.pricePerCall,
          method: "x402",
          status: "settled",
        });
        recordTransaction(tx);

        // Fire-and-forget: record usage on-chain for stats tracking
        fireRecordUsage(resource.id, 1, resource.pricing.pricePerCall);

        next();
        return;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "x402 verification error";
        console.error(`[x402Gate] Path A error: ${message}`);
        res.status(500).json({ error: message });
        return;
      }
    }

    // ------------------------------------------------------------------
    // Path B: x-payment-id header (on-chain gateway for agents)
    // ------------------------------------------------------------------
    const paymentId = req.headers["x-payment-id"] as string | undefined;
    if (paymentId) {
      try {
        // Replay protection: reject already-used paymentIds
        if (isPaymentIdUsed(paymentId)) {
          res.status(402).json({
            error: "Payment already used",
            paymentId,
          });
          return;
        }

        const provider = new ethers.JsonRpcProvider(config.gatewayRpcUrl);
        const gateway = new ethers.Contract(
          config.gatewayAddress,
          GATEWAY_ABI,
          provider
        );

        const [valid, payer, amount] = (await gateway.verifyPayment(
          paymentId
        )) as [boolean, string, bigint];

        if (!valid) {
          res.status(402).json({
            error: "Gateway payment verification failed",
            paymentId,
          });
          return;
        }

        // Ensure the payment covers the resource price
        const requiredAmount = BigInt(resource.pricing.pricePerCall);
        if (amount < requiredAmount) {
          res.status(402).json({
            error: "Insufficient payment amount",
            required: requiredAmount.toString(),
            received: amount.toString(),
          });
          return;
        }

        // Mark paymentId as used (prevents replay)
        markPaymentIdUsed(paymentId);

        // Record audit trail
        const tx = createTransaction({
          resourceId: resource.id,
          payer,
          amount: amount.toString(),
          method: "gateway",
          status: "verified",
          paymentId,
        });
        recordTransaction(tx);

        next();
        return;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Gateway verification error";
        console.error(`[x402Gate] Path B error: ${message}`);
        res.status(500).json({ error: message });
        return;
      }
    }

    // ------------------------------------------------------------------
    // No payment header → respond 402 with requirements
    // ------------------------------------------------------------------
    const errorBody: X402ErrorResponse = {
      x402Version: 1,
      error: "Payment required",
      accepts: [accept],
      gatewayContract: config.gatewayAddress,
      serviceId: resourceId,
    };

    res.setHeader(
      "PAYMENT-REQUIRED",
      Buffer.from(JSON.stringify(errorBody)).toString("base64")
    );
    res.status(402).json(errorBody);
  };
}
