"use client";

import { useState } from "react";
import { useWalletClient } from "wagmi";
import { createX402Client } from "@/lib/x402Client";
import { AxiosRequestConfig } from "axios";

export function useX402Payment() {
  const { data: walletClient } = useWalletClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const makePayment = async (
    url: string,
    method: "GET" | "POST" = "GET",
    data?: unknown,
    config?: AxiosRequestConfig
  ) => {
    if (!walletClient) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = createX402Client({ walletClient });

      const response = await client.request({
        url,
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
  };
}
