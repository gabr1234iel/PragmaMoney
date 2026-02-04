"use client";

import { useBalance } from "wagmi";
import { USDC_ADDRESS } from "@/lib/contracts";
import { formatUSDC } from "@/lib/utils";
import { Address } from "viem";

interface BalanceDisplayProps {
  address?: string;
}

export function BalanceDisplay({ address }: BalanceDisplayProps) {
  const { data: ethBalance, isLoading: ethLoading } = useBalance({
    address: address as Address,
  });

  const { data: usdcBalance, isLoading: usdcLoading } = useBalance({
    address: address as Address,
    token: USDC_ADDRESS,
  });

  if (!address) return null;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-lobster-text">ETH Balance</span>
        {ethLoading ? (
          <div className="skeleton h-5 w-20" />
        ) : (
          <span className="font-semibold text-lobster-dark">
            {ethBalance ? `${parseFloat(ethBalance.formatted).toFixed(4)} ETH` : "0 ETH"}
          </span>
        )}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-lobster-text">USDC Balance</span>
        {usdcLoading ? (
          <div className="skeleton h-5 w-20" />
        ) : (
          <span className="font-semibold text-lobster-primary">
            {usdcBalance ? `${formatUSDC(usdcBalance.value)} USDC` : "0 USDC"}
          </span>
        )}
      </div>
    </div>
  );
}
