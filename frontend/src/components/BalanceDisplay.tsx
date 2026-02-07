"use client";

import { useBalance } from "wagmi";
import { USDC_ADDRESS } from "@/lib/contracts";
import { formatUSDC } from "@/lib/utils";
import { Address } from "viem";

interface BalanceDisplayProps {
  address?: string;
  variant?: "dark" | "light";
}

export function BalanceDisplay({ address, variant = "dark" }: BalanceDisplayProps) {
  const { data: ethBalance, isLoading: ethLoading } = useBalance({
    address: address as Address,
  });

  const { data: usdcBalance, isLoading: usdcLoading } = useBalance({
    address: address as Address,
    token: USDC_ADDRESS,
  });

  if (!address) return null;

  const labelClass =
    variant === "light" ? "text-sm text-[#5E5A6A]" : "text-sm text-white/90";
  const valueClass =
    variant === "light" ? "font-semibold text-[#1C1B1F]" : "font-semibold text-white";

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className={labelClass}>ETH Balance</span>
        {ethLoading ? (
          <div className="skeleton h-5 w-20" />
        ) : (
          <span className={valueClass}>
            {ethBalance ? `${parseFloat(ethBalance.formatted).toFixed(4)} ETH` : "0 ETH"}
          </span>
        )}
      </div>

      <div className="flex justify-between items-center">
        <span className={labelClass}>USDC Balance</span>
        {usdcLoading ? (
          <div className="skeleton h-5 w-20" />
        ) : (
          <span className={valueClass}>
            {usdcBalance ? `${formatUSDC(usdcBalance.value)} USDC` : "0 USDC"}
          </span>
        )}
      </div>
    </div>
  );
}
