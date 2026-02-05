"use client";

import { useState, useEffect } from "react";
import { usePublicClient } from "wagmi";
import { type Address } from "viem";
import { SpendingPolicy, DailySpend } from "@/types";
import { AGENT_SMART_ACCOUNT_ABI } from "@/lib/contracts";

export function useWalletPolicy(agentAccountAddress?: string) {
  const publicClient = usePublicClient();
  const [policy, setPolicy] = useState<SpendingPolicy | null>(null);
  const [dailySpend, setDailySpend] = useState<DailySpend | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchPolicy = async () => {
      if (!agentAccountAddress || !publicClient) {
        setPolicy(null);
        setDailySpend(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [policyData, spendData] = await Promise.all([
          publicClient.readContract({
            address: agentAccountAddress as Address,
            abi: AGENT_SMART_ACCOUNT_ABI,
            functionName: "getPolicy",
          }),
          publicClient.readContract({
            address: agentAccountAddress as Address,
            abi: AGENT_SMART_ACCOUNT_ABI,
            functionName: "getDailySpend",
          }),
        ]);

        setPolicy({
          dailyLimit: policyData.dailyLimit,
          expiresAt: policyData.expiresAt,
          requiresApprovalAbove: policyData.requiresApprovalAbove,
          // Can't enumerate allowed targets/tokens from current ABI
          // (only getAllowedTarget(address) exists, which checks a single address)
          // TODO: Add enumeration support in contract
          allowedTargets: [],
          allowedTokens: [],
        });
        setDailySpend({
          amount: spendData[0],
          lastReset: spendData[1],
        });
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error("Failed to fetch policy")
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchPolicy();
  }, [agentAccountAddress, publicClient]);

  return {
    policy,
    dailySpend,
    isLoading,
    error,
  };
}
