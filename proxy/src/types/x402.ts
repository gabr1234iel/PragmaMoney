/**
 * x402 Protocol type definitions for PragmaMoney proxy server.
 *
 * These types model the x402 payment protocol, the on-chain gateway
 * payment path, and the shared resource/transaction types used by
 * both payment verification paths.
 */

// ---------------------------------------------------------------------------
// x402 Standard Types (EIP-3009 / facilitator path)
// ---------------------------------------------------------------------------

export interface PaymentRequirementsAccept {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: {
    name: string;
    version: string;
  };
}

export interface PaymentRequirements {
  x402Version: number;
  accepts: PaymentRequirementsAccept[];
}

/**
 * Decoded content of the `x-payment` header sent by end-user clients
 * following the x402 specification.
 */
export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    signature: string;
  };
}

// ---------------------------------------------------------------------------
// On-chain Gateway Types (agent path)
// ---------------------------------------------------------------------------

export interface GatewayPayment {
  paymentId: string;
  payer: string;
  amount: bigint;
  serviceId: string;
  valid: boolean;
}

export interface VerifyResult {
  valid: boolean;
  payer: string;
  amount: bigint;
}

// ---------------------------------------------------------------------------
// Resource Types
// ---------------------------------------------------------------------------

export type ServiceType = "COMPUTE" | "STORAGE" | "API" | "AGENT" | "OTHER";

export interface ResourcePricing {
  /** Price per call in atomic USDC units (6 decimals). E.g. "1000" = 0.001 USDC */
  pricePerCall: string;
  currency: "USDC";
}

export interface Resource {
  id: string;
  name: string;
  type: ServiceType;
  creatorAddress: string;
  originalUrl: string;
  proxyUrl: string;
  pricing: ResourcePricing;
  apiKey?: string;
  apiKeyHeader?: string;
}

// ---------------------------------------------------------------------------
// Transaction / Audit Types
// ---------------------------------------------------------------------------

export type PaymentMethod = "x402" | "gateway";
export type TransactionStatus = "pending" | "verified" | "settled" | "failed";

export interface Transaction {
  id: string;
  resourceId: string;
  payer: string;
  amount: string;
  method: PaymentMethod;
  timestamp: number;
  status: TransactionStatus;
  paymentId?: string;
}

// ---------------------------------------------------------------------------
// 402 Error Response
// ---------------------------------------------------------------------------

export interface X402ErrorResponse {
  x402Version: number;
  error: string;
  accepts: PaymentRequirementsAccept[];
  gatewayContract: string;
  serviceId: string;
}
