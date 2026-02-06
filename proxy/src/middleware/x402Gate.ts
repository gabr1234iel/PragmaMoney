import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ethers } from "ethers";

import { config } from "../config.js";
import { initDeployerNonce, allocateNonce } from "../services/nonceManager.js";
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
  "function getService(bytes32 serviceId) view returns (tuple(uint256 agentId, address owner, string name, uint256 pricePerCall, string endpoint, uint8 serviceType, bool active, uint256 totalCalls, uint256 totalRevenue))",
];

const AGENT_FACTORY_ABI = [
  "function poolByAgentId(uint256 agentId) view returns (address)",
];

const IDENTITY_REGISTRY_ABI = [
  "function getAgentWallet(uint256 agentId) view returns (address)",
];

const ERC20_TRANSFER_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
];

const POOL_BPS = 4000n;  // 40% to pool
const BPS = 10_000n;
const BYTES32_HEX_PATTERN = /^0x[0-9a-fA-F]{64}$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SplitTargets {
  agentWallet: string;
  pool: string;
}

interface ServiceInfo {
  owner: string;
  splitTargets: SplitTargets | null;
}

/**
 * Resolve on-chain service info: owner + split targets (agentWallet, pool).
 * Only works for on-chain services (bytes32 hex: 0x + 64 hex chars).
 * Returns null on failure so callers can fall back to resource.creatorAddress.
 * splitTargets is null if the agent has no wallet or pool (graceful fallback).
 */
async function resolveServiceInfo(serviceId: string): Promise<ServiceInfo | null> {
  if (!BYTES32_HEX_PATTERN.test(serviceId)) {
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
    const agentId = service.agentId as bigint;

    if (!owner || owner === ethers.ZeroAddress) {
      return null;
    }

    console.log(`[x402Gate] Resolved on-chain owner for ${serviceId}: ${owner}, agentId=${agentId}`);

    // Try to resolve split targets (agentWallet + pool)
    let splitTargets: SplitTargets | null = null;
    try {
      const identityRegistry = new ethers.Contract(
        config.identityRegistryAddress,
        IDENTITY_REGISTRY_ABI,
        provider
      );
      const agentFactory = new ethers.Contract(
        config.agentPoolFactoryAddress,
        AGENT_FACTORY_ABI,
        provider
      );

      const [agentWallet, pool] = await Promise.all([
        identityRegistry.getAgentWallet(agentId) as Promise<string>,
        agentFactory.poolByAgentId(agentId) as Promise<string>,
      ]);

      if (
        agentWallet && agentWallet !== ethers.ZeroAddress &&
        pool && pool !== ethers.ZeroAddress
      ) {
        splitTargets = { agentWallet, pool };
        console.log(`[x402Gate] Split targets for agentId=${agentId}: wallet=${agentWallet}, pool=${pool}`);
      } else {
        console.log(`[x402Gate] No split targets for agentId=${agentId} (wallet=${agentWallet}, pool=${pool})`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[x402Gate] Failed to resolve split targets for agentId=${agentId}: ${message}`);
    }

    return { owner, splitTargets };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[x402Gate] Failed to resolve service info for ${serviceId}: ${message}`);
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
 * Cached proxy signer address to avoid repeated wallet instantiation.
 * Computed once on first access.
 */
let _cachedProxySignerAddress: string | null = null;

/**
 * Derive the proxy signer's address from the private key.
 * Cached after first call for efficiency.
 */
function computeProxySignerAddress(): string {
  if (!_cachedProxySignerAddress) {
    _cachedProxySignerAddress = new ethers.Wallet(config.proxySignerKey).address;
  }
  return _cachedProxySignerAddress;
}

/**
 * Create a signer for the deployer/proxy key, initializing the nonce manager
 * if needed. All deployer transactions must go through this to avoid nonce
 * collisions with other endpoints (registerAgent, fund-agent, etc.).
 */
async function getDeployerSigner(): Promise<ethers.Wallet> {
  const provider = new ethers.JsonRpcProvider(config.gatewayRpcUrl);
  const signer = new ethers.Wallet(config.proxySignerKey, provider);
  await initDeployerNonce(provider, signer.address);
  return signer;
}

/**
 * Fire-and-forget: split USDC 40/60 (pool/agentWallet) and record usage.
 * Called after x402 settlement when the service has split targets.
 * USDC arrives at proxy signer via x402, then gets distributed.
 */
function fireSplitAndRecordUsage(
  serviceId: string,
  totalAmount: string,
  targets: SplitTargets
): void {
  if (!config.proxySignerKey) {
    console.warn("[x402Gate] No PROXY_SIGNER_KEY configured, skipping split");
    return;
  }

  const total = BigInt(totalAmount);
  const poolAmount = (total * POOL_BPS) / BPS;
  const walletAmount = total - poolAmount;

  (async () => {
    try {
      const signer = await getDeployerSigner();

      const usdc = new ethers.Contract(config.usdcAddress, ERC20_TRANSFER_ABI, signer);
      const registry = new ethers.Contract(config.serviceRegistryAddress, SERVICE_REGISTRY_ABI, signer);

      // 1. Transfer 40% to pool
      const nonce1 = allocateNonce();
      const tx1 = await usdc.transfer(targets.pool, poolAmount, { nonce: nonce1 });
      console.log(`[x402Gate] Split 40% to pool ${targets.pool}: tx=${tx1.hash}`);
      await tx1.wait();

      // 2. Transfer 60% to agent wallet
      const nonce2 = allocateNonce();
      const tx2 = await usdc.transfer(targets.agentWallet, walletAmount, { nonce: nonce2 });
      console.log(`[x402Gate] Split 60% to wallet ${targets.agentWallet}: tx=${tx2.hash}`);
      await tx2.wait();

      // 3. Record usage on-chain
      const nonce3 = allocateNonce();
      const tx3 = await registry.recordUsage(serviceId, 1, totalAmount, { nonce: nonce3 });
      console.log(`[x402Gate] recordUsage tx sent: ${tx3.hash}`);
      await tx3.wait();

      console.log(`[x402Gate] Split complete: pool=${poolAmount}, wallet=${walletAmount}, serviceId=${serviceId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[x402Gate] fireSplitAndRecordUsage failed: ${message} (USDC stays at proxy signer)`);
    }
  })();
}

/**
 * Fire-and-forget: call ServiceRegistry.recordUsage() on-chain.
 * Records x402 Path A usage stats without blocking the HTTP response.
 * Uses nonce manager to avoid conflicts with other deployer transactions.
 */
function fireRecordUsage(serviceId: string, calls: number, amount: string): void {
  if (!config.proxySignerKey) {
    console.warn("[x402Gate] No PROXY_SIGNER_KEY configured, skipping on-chain recordUsage");
    return;
  }

  // Only call for on-chain services (bytes32 hex: 0x + 64 hex chars)
  if (!BYTES32_HEX_PATTERN.test(serviceId)) {
    return;
  }

  (async () => {
    try {
      const signer = await getDeployerSigner();
      const registry = new ethers.Contract(
        config.serviceRegistryAddress,
        SERVICE_REGISTRY_ABI,
        signer
      );

      const nonce = allocateNonce();
      const tx = await registry.recordUsage(serviceId, calls, amount, { nonce });
      console.log(`[x402Gate] recordUsage tx sent: ${tx.hash}`);
      await tx.wait();
      console.log(`[x402Gate] recordUsage confirmed for serviceId=${serviceId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[x402Gate] recordUsage failed: ${message}`);
    }
  })();
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

    // Resolve on-chain service info (owner + split targets)
    const serviceInfo = await resolveServiceInfo(resourceId);

    // Payment routing logic:
    // 1. If split targets exist AND proxy signer is configured → route to proxy signer (will split 40/60)
    // 2. Otherwise, if on-chain owner exists → pay owner directly
    // 3. Otherwise → pay resource.creatorAddress (off-chain fallback in buildAccept)
    let payTo: string | undefined;
    if (serviceInfo?.splitTargets && config.proxySignerKey) {
      payTo = computeProxySignerAddress();
    } else if (serviceInfo?.owner) {
      payTo = serviceInfo.owner;
    } else {
      payTo = undefined; // Will use resource.creatorAddress in buildAccept
    }
    const accept = buildAccept(resource, req.originalUrl, payTo);

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

        // Fire-and-forget: split USDC + record usage, or just record usage
        if (serviceInfo?.splitTargets) {
          fireSplitAndRecordUsage(resource.id, resource.pricing.pricePerCall, serviceInfo.splitTargets);
        } else {
          fireRecordUsage(resource.id, 1, resource.pricing.pricePerCall);
        }

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
