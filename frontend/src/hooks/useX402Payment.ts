"use client";

import { useState, useMemo } from "react";
import { useWalletClient } from "wagmi";
import { createX402Client, PROXY_URL } from "@/lib/x402Client";
import type { AxiosRequestConfig } from "axios";

export function useX402Payment() {
  const { data: walletClient } = useWalletClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const client = useMemo(() => {
    if (!walletClient) return null;
    return createX402Client({ walletClient });
  }, [walletClient]);

  /**
   * Make a paid request through the proxy.
   * @param resourceId - The proxy resource ID (e.g. "echo-service")
   * @param method - HTTP method
   * @param data - Request body (for POST/PUT)
   * @param config - Additional axios config
   */
  const makePayment = async (
    resourceId: string,
    method: "GET" | "POST" = "GET",
    data?: unknown,
    config?: AxiosRequestConfig
  ) => {
    if (!client) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await client.request({
        url: `/proxy/${resourceId}`,
        method,
        data,
        ...config,
      });

      return response.data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Payment failed");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    makePayment,
    isLoading,
    error,
    proxyUrl: PROXY_URL,
  };
}
