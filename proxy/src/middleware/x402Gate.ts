import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ethers } from "ethers";

import { config } from "../config.js";
import { getResource } from "../services/resourceStore.js";
import {
  verifyPayment as facilitatorVerify,
  settlePayment as facilitatorSettle,
} from "../services/facilitator.js";
import {
  createTransaction,
  recordTransaction,
} from "../models/Transaction.js";
import type {
  PaymentRequirements,
  PaymentRequirementsAccept,
  X402ErrorResponse,
} from "../types/x402.js";

// ---------------------------------------------------------------------------
// Gateway ABI (minimal -- only the verifyPayment view function)
// ---------------------------------------------------------------------------

const GATEWAY_ABI = [
  "function verifyPayment(bytes32 paymentId) view returns (bool valid, address payer, uint256 amount)",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Build the standard x402 PaymentRequirementsAccept block for a resource.
 */
function buildAccept(
  resource: { creatorAddress: string; pricing: { pricePerCall: string } },
  requestUrl: string
): PaymentRequirementsAccept {
  return {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: resource.pricing.pricePerCall,
    resource: requestUrl,
    payTo: resource.creatorAddress,
    maxTimeoutSeconds: 60,
    asset: config.usdcAddress,
    extra: { name: "USDC", version: "1" },
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

    const accept = buildAccept(resource, req.originalUrl);
    const requirements: PaymentRequirements = {
      x402Version: 1,
      accepts: [accept],
    };

    // ------------------------------------------------------------------
    // Path A: x-payment header (x402 facilitator for end users)
    // ------------------------------------------------------------------
    const paymentHeader = req.headers["x-payment"] as string | undefined;
    if (paymentHeader) {
      try {
        // Verify
        const verifyResult = await facilitatorVerify(
          paymentHeader,
          requirements
        );

        if (!verifyResult.valid) {
          res.status(402).json({
            error: "Payment verification failed",
            reason: verifyResult.invalidReason,
          });
          return;
        }

        // Settle
        const settleResult = await facilitatorSettle(
          paymentHeader,
          requirements
        );

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
        const tx = createTransaction({
          resourceId: resource.id,
          payer: "x402-user", // real payer is inside the signed payload
          amount: resource.pricing.pricePerCall,
          method: "x402",
          status: "settled",
        });
        recordTransaction(tx);

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

        // Record audit trail
        const tx = createTransaction({
          resourceId: resource.id,
          payer,
          amount: amount.toString(),
          method: "gateway",
          status: "verified",
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

    res.status(402).json(errorBody);
  };
}
