"use client";

import { useState, useEffect } from "react";
import { SpendingPolicy, DailySpend } from "@/types";
import { mockSpendingPolicy, mockDailySpend } from "@/lib/mockData";

export function useWalletPolicy(agentAccountAddress?: string) {
  const [policy, setPolicy] = useState<SpendingPolicy | null>(null);
  const [dailySpend, setDailySpend] = useState<DailySpend | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchPolicy = async () => {
      if (!agentAccountAddress) {
        setPolicy(null);
        setDailySpend(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 300));

        // TODO: Replace with actual contract reads when deployed
        // const policyData = await readContract({
        //   address: agentAccountAddress as Address,
        //   abi: AGENT_SMART_ACCOUNT_ABI,
        //   functionName: 'getPolicy',
        // });
        // const dailySpendData = await readContract({
        //   address: agentAccountAddress as Address,
        //   abi: AGENT_SMART_ACCOUNT_ABI,
        //   functionName: 'getDailySpend',
        // });

        setPolicy(mockSpendingPolicy);
        setDailySpend(mockDailySpend);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to fetch policy"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPolicy();
  }, [agentAccountAddress]);

  return {
    policy,
    dailySpend,
    isLoading,
    error,
  };
}
