"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import {
  AGENT_POOL_ABI,
  IDENTITY_REGISTRY_ABI,
  IDENTITY_REGISTRY_ADDRESS,
} from "@/lib/contracts";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org"),
});

export interface PoolData {
  // ERC-4626
  name: string;
  symbol: string;
  asset: Address;
  totalAssets: bigint;
  totalSupply: bigint;
  sharePrice: string; // formatted: "1.00" USDC per share
  // Pool-specific
  agentId: bigint;
  dailyCap: bigint;
  remainingCapToday: bigint;
  spentToday: bigint;
  vestingDuration: bigint;
  agentRevoked: boolean;
  metadataURI: string;
  // Agent info (from IdentityRegistry)
  agentName: string;
  agentOwner: Address;
  agentWallet: Address;
}

export interface UserPosition {
  shares: bigint;
  assetsValue: bigint; // shares converted to USDC
  maxWithdraw: bigint;
  isLocked: boolean;
  unlockTime: bigint;
}

export function useAgentPool(poolAddress: Address | undefined, userAddress: Address | undefined) {
  const [pool, setPool] = useState<PoolData | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPool = useCallback(async () => {
    if (!poolAddress) return;
    try {
      setIsLoading(true);
      setError(null);

      // Batch read pool state
      const [
        name, symbol, asset, totalAssets, totalSupply,
        agentId, dailyCap, remainingCapToday, spentToday,
        vestingDuration, agentRevoked, metadataURI, sharePriceRaw,
      ] = await Promise.all([
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "name" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "symbol" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "asset" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "totalAssets" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "totalSupply" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "agentId" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "dailyCap" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "remainingCapToday" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "spentToday" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "vestingDuration" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "agentRevoked" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "metadataURI" }),
        publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "convertToAssets", args: [BigInt(1e18)] }),
      ]);

      // Fetch agent info from IdentityRegistry
      const [agentOwner, agentWallet, agentURI] = await Promise.all([
        publicClient.readContract({ address: IDENTITY_REGISTRY_ADDRESS, abi: IDENTITY_REGISTRY_ABI, functionName: "ownerOf", args: [agentId as bigint] }),
        publicClient.readContract({ address: IDENTITY_REGISTRY_ADDRESS, abi: IDENTITY_REGISTRY_ABI, functionName: "getAgentWallet", args: [agentId as bigint] }),
        publicClient.readContract({ address: IDENTITY_REGISTRY_ADDRESS, abi: IDENTITY_REGISTRY_ABI, functionName: "tokenURI", args: [agentId as bigint] }),
      ]);

      let agentName = `Agent #${agentId}`;
      try {
        const parsed = JSON.parse(agentURI as string);
        if (parsed.name) agentName = parsed.name;
      } catch { /* not JSON */ }

      const sharePrice = formatUnits(sharePriceRaw as bigint, 6);

      setPool({
        name: name as string,
        symbol: symbol as string,
        asset: asset as Address,
        totalAssets: totalAssets as bigint,
        totalSupply: totalSupply as bigint,
        sharePrice,
        agentId: agentId as bigint,
        dailyCap: dailyCap as bigint,
        remainingCapToday: remainingCapToday as bigint,
        spentToday: spentToday as bigint,
        vestingDuration: vestingDuration as bigint,
        agentRevoked: agentRevoked as boolean,
        metadataURI: metadataURI as string,
        agentName,
        agentOwner: agentOwner as Address,
        agentWallet: agentWallet as Address,
      });

      // Fetch user position if connected
      if (userAddress) {
        const [shares, maxWithdraw, isLocked, unlockTime] = await Promise.all([
          publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "balanceOf", args: [userAddress] }),
          publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "maxWithdraw", args: [userAddress] }),
          publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "isUserLocked", args: [userAddress] }),
          publicClient.readContract({ address: poolAddress, abi: AGENT_POOL_ABI, functionName: "getUserUnlockTime", args: [userAddress] }),
        ]);

        let assetsValue = BigInt(0);
        if ((shares as bigint) > BigInt(0)) {
          assetsValue = await publicClient.readContract({
            address: poolAddress, abi: AGENT_POOL_ABI, functionName: "convertToAssets", args: [shares as bigint],
          }) as bigint;
        }

        setUserPosition({
          shares: shares as bigint,
          assetsValue,
          maxWithdraw: maxWithdraw as bigint,
          isLocked: isLocked as boolean,
          unlockTime: unlockTime as bigint,
        });
      }
    } catch (err) {
      console.error("Failed to fetch pool data:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch pool data"));
    } finally {
      setIsLoading(false);
    }
  }, [poolAddress, userAddress]);

  useEffect(() => {
    fetchPool();
  }, [fetchPool]);

  return { pool, userPosition, isLoading, error, refetch: fetchPool };
}
