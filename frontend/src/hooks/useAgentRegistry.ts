"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import type { Agent } from "@/types";
import {
  AGENT_POOL_FACTORY_ADDRESS,
  AGENT_POOL_FACTORY_ABI,
  IDENTITY_REGISTRY_ADDRESS,
  IDENTITY_REGISTRY_ABI,
} from "@/lib/contracts";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org"),
});

export function useAgentRegistry() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 1. Read agent count from AgentFactory
      const count = await publicClient.readContract({
        address: AGENT_POOL_FACTORY_ADDRESS,
        abi: AGENT_POOL_FACTORY_ABI,
        functionName: "agentCount",
      });

      const fetched: Agent[] = [];

      // 2. For each index, get agentId and details
      for (let i = BigInt(0); i < count; i++) {
        try {
          const agentId = await publicClient.readContract({
            address: AGENT_POOL_FACTORY_ADDRESS,
            abi: AGENT_POOL_FACTORY_ABI,
            functionName: "getAgentIdAt",
            args: [i],
          });

          // 3. Read pool address
          const poolAddress = await publicClient.readContract({
            address: AGENT_POOL_FACTORY_ADDRESS,
            abi: AGENT_POOL_FACTORY_ABI,
            functionName: "poolByAgentId",
            args: [agentId],
          }) as Address;

          // 4. Read IdentityRegistry data
          const [owner, walletAddress, agentURI] = await Promise.all([
            publicClient.readContract({
              address: IDENTITY_REGISTRY_ADDRESS,
              abi: IDENTITY_REGISTRY_ABI,
              functionName: "ownerOf",
              args: [agentId],
            }) as Promise<Address>,
            publicClient.readContract({
              address: IDENTITY_REGISTRY_ADDRESS,
              abi: IDENTITY_REGISTRY_ABI,
              functionName: "getAgentWallet",
              args: [agentId],
            }) as Promise<Address>,
            publicClient.readContract({
              address: IDENTITY_REGISTRY_ADDRESS,
              abi: IDENTITY_REGISTRY_ABI,
              functionName: "tokenURI",
              args: [agentId],
            }) as Promise<string>,
          ]);

          // 5. Parse name from agentURI JSON
          let name = `Agent #${agentId}`;
          try {
            const parsed = JSON.parse(agentURI);
            if (parsed.name) name = parsed.name;
          } catch {
            // agentURI is not valid JSON, use fallback name
          }

          fetched.push({
            agentId,
            owner: owner as string,
            walletAddress: walletAddress as string,
            agentURI,
            name,
            poolAddress: poolAddress as string,
          });
        } catch {
          // Skip agents that can't be read (e.g., burned)
          continue;
        }
      }

      setAgents(fetched);
    } catch (err) {
      console.error("Failed to fetch agents:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch agents"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return { agents, isLoading, error, refetch: fetchAgents };
}
