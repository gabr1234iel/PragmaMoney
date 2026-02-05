import fetch from "node-fetch";
import { config } from "../config.js";
import type { PaymentRequirementsAccept, PaymentPayload } from "../types/x402.js";

/**
 * x402 facilitator client.
 *
 * The facilitator is a third-party service (e.g. x402.org) that verifies
 * and settles EIP-3009 USDC transfer authorizations on behalf of resource
 * servers. This module wraps the two facilitator endpoints (verify + settle).
 *
 * The facilitator expects:
 *   { x402Version, paymentPayload: <decoded object>, paymentRequirements: <single accept> }
 */

export interface FacilitatorVerifyResult {
  valid: boolean;
  invalidReason?: string;
}

export interface FacilitatorSettleResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Decode the base64-encoded X-PAYMENT header into a PaymentPayload object.
 */
export function decodePaymentHeader(headerValue: string): PaymentPayload {
  const json = Buffer.from(headerValue, "base64").toString("utf-8");
  return JSON.parse(json) as PaymentPayload;
}

/**
 * Verify a payment payload against the given requirements via the facilitator.
 */
export async function verifyPayment(
  decodedPayload: PaymentPayload,
  requirement: PaymentRequirementsAccept
): Promise<FacilitatorVerifyResult> {
  try {
    const url = `${config.facilitatorUrl}/verify`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: decodedPayload.x402Version ?? 1,
        paymentPayload: decodedPayload,
        paymentRequirements: requirement,
      }),
    });

    const text = await res.text();
    console.log(`[facilitator] verify returned ${res.status}: ${text}`);

    if (!res.ok) {
      return { valid: false, invalidReason: `Facilitator HTTP ${res.status}: ${text}` };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { valid: false, invalidReason: `Facilitator returned non-JSON: ${text.slice(0, 200)}` };
    }

    return {
      valid: data.isValid === true,
      invalidReason: data.invalidReason as string | undefined,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown facilitator error";
    console.error(`[facilitator] verify error: ${message}`);
    return { valid: false, invalidReason: message };
  }
}

/**
 * Settle (execute) a verified payment via the facilitator.
 */
export async function settlePayment(
  decodedPayload: PaymentPayload,
  requirement: PaymentRequirementsAccept
): Promise<FacilitatorSettleResult> {
  try {
    const url = `${config.facilitatorUrl}/settle`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: decodedPayload.x402Version ?? 1,
        paymentPayload: decodedPayload,
        paymentRequirements: requirement,
      }),
    });

    const text = await res.text();
    console.log(`[facilitator] settle returned ${res.status}: ${text}`);

    if (!res.ok) {
      return { success: false, error: `Facilitator HTTP ${res.status}: ${text}` };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { success: false, error: `Facilitator returned non-JSON: ${text.slice(0, 200)}` };
    }

    return {
      success: data.success === true,
      txHash: data.txHash as string | undefined,
      error: data.success !== true
        ? (data.error as string) ?? (data.invalidReason as string) ?? `Settle failed: ${text.slice(0, 200)}`
        : undefined,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown facilitator error";
    console.error(`[facilitator] settle error: ${message}`);
    return { success: false, error: message };
  }
}
