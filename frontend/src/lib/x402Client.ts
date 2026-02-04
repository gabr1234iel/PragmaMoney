import axios, { AxiosInstance } from "axios";
import { WalletClient } from "viem";

export interface X402ClientOptions {
  walletClient: WalletClient;
  facilitatorUrl?: string;
}

/**
 * Creates an axios instance with x402 payment interceptors
 * This enables automatic payment handling for 402 Payment Required responses
 */
export function createX402Client(options: X402ClientOptions): AxiosInstance {
  const { walletClient, facilitatorUrl = "https://x402.org/facilitator" } = options;

  const client = axios.create({
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // Placeholder for x402-axios integration
  // TODO: Integrate x402-axios package once wallet client is ready
  // The x402-axios package will handle:
  // 1. Detecting 402 Payment Required responses
  // 2. Parsing payment requirements from WWW-Authenticate header
  // 3. Generating EIP-3009 signatures via the wallet
  // 4. Submitting payment to facilitator
  // 5. Retrying the original request with x-payment header

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 402) {
        console.log("402 Payment Required detected");
        console.log("Payment requirements:", error.response.headers["www-authenticate"]);

        // For now, just throw the error
        // In production, x402-axios will handle this automatically
        throw new Error(
          "Payment required. Please ensure x402-axios is properly configured."
        );
      }

      throw error;
    }
  );

  return client;
}

/**
 * Hook-friendly wrapper for x402 client creation
 */
export function useX402Client(walletClient?: WalletClient): AxiosInstance | null {
  if (!walletClient) return null;

  return createX402Client({ walletClient });
}
