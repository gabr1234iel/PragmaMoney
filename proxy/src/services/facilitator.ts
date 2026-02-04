import fetch from "node-fetch";
import { config } from "../config.js";
import type { PaymentRequirements } from "../types/x402.js";

/**
 * x402 facilitator client.
 *
 * The facilitator is a third-party service (e.g. x402.org) that verifies
 * and settles EIP-3009 USDC transfer authorizations on behalf of resource
 * servers. This module wraps the two facilitator endpoints (verify + settle).
 *
 * NOTE: Calls to the real facilitator require a genuine EIP-3009 signed
 * payment payload from a funded wallet. During development, the verify/settle
 * calls will likely return errors -- we handle them gracefully.
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
 * Verify a payment payload against the given requirements via the facilitator.
 */
export async function verifyPayment(
  paymentHeader: string,
  requirements: PaymentRequirements
): Promise<FacilitatorVerifyResult> {
  try {
    const url = `${config.facilitatorUrl}/verify`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: paymentHeader,
        requirements,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[facilitator] verify returned ${res.status}: ${text}`
      );
      return { valid: false, invalidReason: `Facilitator HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      isValid?: boolean;
      invalidReason?: string;
    };

    return {
      valid: data.isValid === true,
      invalidReason: data.invalidReason,
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
  paymentHeader: string,
  requirements: PaymentRequirements
): Promise<FacilitatorSettleResult> {
  try {
    const url = `${config.facilitatorUrl}/settle`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: paymentHeader,
        requirements,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[facilitator] settle returned ${res.status}: ${text}`
      );
      return { success: false, error: `Facilitator HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      success?: boolean;
      txHash?: string;
      error?: string;
    };

    return {
      success: data.success === true,
      txHash: data.txHash,
      error: data.error,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown facilitator error";
    console.error(`[facilitator] settle error: ${message}`);
    return { success: false, error: message };
  }
}
