import axios, { AxiosInstance } from "axios";
import { WalletClient } from "viem";
import { withPaymentInterceptor } from "x402-axios";

export const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:4402";

export interface X402ClientOptions {
  walletClient: WalletClient;
}

/**
 * Creates an axios instance with x402 payment interceptors.
 * When a request returns 402, x402-axios automatically:
 * 1. Parses payment requirements from the response
 * 2. Signs an EIP-3009 authorization with the wallet
 * 3. Retries the request with X-PAYMENT header
 */
export function createX402Client(options: X402ClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL: PROXY_URL,
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // x402-axios expects account to be non-optional; wagmi's walletClient
  // always has an account when connected, so the cast is safe here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return withPaymentInterceptor(client, options.walletClient as any);
}
