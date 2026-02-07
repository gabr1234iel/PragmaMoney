"use client";

import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { type Address, formatUnits } from "viem";
import { useAgentPool } from "@/hooks/useAgentPool";
import { EarningsChart } from "@/components/EarningsChart";
import { AGENT_POOL_ABI, ERC20_ABI, USDC_ADDRESS } from "@/lib/contracts";
import { formatUSDC, formatAddress, parseUSDC, cn, getBaseScanUrl } from "@/lib/utils";
import {
  ArrowLeft, Bot, Shield, DollarSign, TrendingUp, Clock,
  Wallet, ExternalLink, Loader2, CheckCircle, AlertCircle, Lock, Unlock,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function PoolPage({ params }: { params: { address: string } }) {
  const poolAddress = params.address as Address;
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { pool, userPosition, isLoading, error, refetch } = useAgentPool(poolAddress, userAddress);
  const { writeContractAsync } = useWriteContract();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [approveTx, setApproveTx] = useState<{ status: string; hash?: string; error?: string }>({ status: "idle" });
  const [depositTx, setDepositTx] = useState<{ status: string; hash?: string; error?: string }>({ status: "idle" });
  const [withdrawTx, setWithdrawTx] = useState<{ status: string; hash?: string; error?: string }>({ status: "idle" });

  const handleApprove = async () => {
    if (!depositAmount || !userAddress || !publicClient) return;
    try {
      setApproveTx({ status: "pending" });
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [poolAddress, parseUSDC(depositAmount)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        setApproveTx({ status: "success", hash });
      } else {
        setApproveTx({ status: "error", error: "Transaction failed" });
      }
    } catch (err) {
      console.error("Approve error:", err);
      setApproveTx({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || !userAddress || !publicClient) return;
    try {
      setDepositTx({ status: "pending" });
      const hash = await writeContractAsync({
        address: poolAddress,
        abi: AGENT_POOL_ABI,
        functionName: "deposit",
        args: [parseUSDC(depositAmount), userAddress],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        setDepositTx({ status: "success", hash });
        await refetch();
        setDepositAmount("");
        setApproveTx({ status: "idle" });
      } else {
        setDepositTx({ status: "error", error: "Transaction failed" });
      }
    } catch (err) {
      console.error("Deposit error:", err);
      setDepositTx({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || !userAddress || !publicClient) return;
    try {
      setWithdrawTx({ status: "pending" });
      const hash = await writeContractAsync({
        address: poolAddress,
        abi: AGENT_POOL_ABI,
        functionName: "withdraw",
        args: [parseUSDC(withdrawAmount), userAddress, userAddress],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        setWithdrawTx({ status: "success", hash });
        await refetch();
        setWithdrawAmount("");
      } else {
        setWithdrawTx({ status: "error", error: "Transaction failed" });
      }
    } catch (err) {
      console.error("Withdraw error:", err);
      setWithdrawTx({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="skeleton h-8 w-32 mb-4" />
            <div className="skeleton h-12 w-64" />
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card space-y-4">
                  <div className="skeleton h-6 w-48" />
                  <div className="skeleton h-24 w-full" />
                </div>
              ))}
            </div>
            <div className="space-y-6">
              <div className="card space-y-4">
                <div className="skeleton h-6 w-48" />
                <div className="skeleton h-12 w-full" />
                <div className="skeleton h-12 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !pool) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card bg-red-50 border-2 border-red-200">
            <div className="flex items-start space-x-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-display text-lg font-semibold text-red-900 mb-2">
                  Failed to load pool
                </h3>
                <p className="text-red-700 mb-4">
                  {error?.message || "Unable to fetch pool data"}
                </p>
                <button onClick={() => refetch()} className="btn-primary bg-red-600 hover:bg-red-700">
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const estimatedShares =
    depositAmount && pool.sharePrice && Number(pool.sharePrice) > 0
      ? (Number(depositAmount) / Number(pool.sharePrice)).toFixed(2)
      : "0";

  const progressPercent =
    pool.dailyCap > BigInt(0)
      ? Math.min((Number(pool.spentToday) / Number(pool.dailyCap)) * 100, 100)
      : 0;

  const formatShares = (val: bigint) => {
    const s = formatUnits(val, 18);
    const dot = s.indexOf(".");
    return dot >= 0 ? s.substring(0, dot + 3) : s;
  };

  return (
    <div className="min-h-screen py-12 relative">
      <div className="absolute top-24 left-6 pointer-events-none hidden xl:block -rotate-12 drop-shadow-lg">
        <Image src="/picture.png" alt="" width={65} height={65} />
      </div>
      <div className="absolute top-48 right-8 pointer-events-none hidden xl:block rotate-6 drop-shadow-lg">
        <Image src="/picture.png" alt="" width={72} height={72} />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/marketplace"
            className="inline-flex items-center space-x-2 text-lobster-primary hover:text-lobster-hover transition-colors duration-200 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Marketplace</span>
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-4xl font-bold text-lobster-dark mb-2">
                {pool.name} ({pool.symbol})
              </h1>
              <div className="flex items-center space-x-4">
                <Link
                  href={`https://sepolia.basescan.org/nft/0x8004A818BFB912233c491871b3d84c89A494BD9e/${pool.agentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-lobster-primary/10 text-lobster-primary hover:bg-lobster-primary/20 transition-colors duration-200"
                >
                  <Bot className="w-4 h-4" />
                  <span className="text-sm font-medium">{pool.agentName}</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
                <span
                  className={cn(
                    "badge",
                    pool.agentRevoked
                      ? "bg-red-100 text-red-700"
                      : "bg-[#0000ff]/10 text-[#0000ff]"
                  )}
                >
                  {pool.agentRevoked ? "Revoked" : "Active"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Pool Overview */}
            <div className="card">
              <div className="flex items-center space-x-2 mb-6">
                <TrendingUp className="w-5 h-5 text-lobster-primary" />
                <h2 className="font-display text-2xl font-semibold text-lobster-dark">Pool Overview</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-[#F7F5F9] border border-[#E7E1EA] rounded-xl p-4">
                  <p className="text-sm text-lobster-text mb-1">Total Assets</p>
                  <p className="font-display text-3xl font-bold text-lobster-dark">${formatUSDC(pool.totalAssets)}</p>
                </div>
                <div className="bg-[#F7F5F9] border border-[#E7E1EA] rounded-xl p-4">
                  <p className="text-sm text-lobster-text mb-1">Share Price</p>
                  <p className="font-display text-2xl font-bold text-lobster-dark">{parseInt(pool.sharePrice) / 1_000_000} USDC</p>
                </div>
                <div className="bg-[#F7F5F9] border border-[#E7E1EA] rounded-xl p-4">
                  <p className="text-sm text-lobster-text mb-1">Total Shares</p>
                  <p className="font-display text-2xl font-bold text-lobster-dark">{formatShares(pool.totalSupply)}</p>
                </div>
              </div>
            </div>

            {/* Daily Activity */}
            <div className="card">
              <div className="flex items-center space-x-2 mb-6">
                <Clock className="w-5 h-5 text-lobster-primary" />
                <h2 className="font-display text-2xl font-semibold text-lobster-dark">Daily Activity</h2>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-lobster-text">Daily Cap</span>
                  <span className="font-semibold text-lobster-dark">${formatUSDC(pool.dailyCap)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lobster-text">Spent Today</span>
                  <span className="font-semibold text-lobster-dark">${formatUSDC(pool.spentToday)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lobster-text">Remaining</span>
                  <span className="font-semibold text-[#0000ff]">
                    ${formatUSDC(pool.remainingCapToday)}
                  </span>
                </div>
                <div className="mt-4">
                  <div className="w-full h-3 bg-[#EFE8F1] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-lobster-primary transition-all duration-500 ease-out rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-lobster-text mt-2 text-center">
                    {progressPercent.toFixed(1)}% of daily cap used
                  </p>
                </div>
              </div>
            </div>

            {/* Earnings Chart */}
            <div className="card">
              <div className="flex items-center space-x-2 mb-6">
                <TrendingUp className="w-5 h-5 text-lobster-primary" />
                <h2 className="font-display text-2xl font-semibold text-lobster-dark">Agent Earnings</h2>
              </div>
              <EarningsChart />
            </div>

            {/* Pool Details */}
            <div className="card">
              <div className="flex items-center space-x-2 mb-6">
                <Shield className="w-5 h-5 text-lobster-primary" />
                <h2 className="font-display text-2xl font-semibold text-lobster-dark">Pool Details</h2>
              </div>
              <div className="space-y-3">
                {[
                  { label: "Vesting Duration", value: `${(Number(pool.vestingDuration) / 86400).toFixed(0)} days` },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-lobster-border">
                    <span className="text-lobster-text">{row.label}</span>
                    <span className="font-medium text-lobster-dark">{row.value}</span>
                  </div>
                ))}
                {[
                  { label: "Pool Asset", addr: pool.asset },
                  { label: "Agent Wallet", addr: pool.agentWallet },
                  { label: "Agent Owner", addr: pool.agentOwner },
                  { label: "Pool Contract", addr: poolAddress },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-lobster-border last:border-0">
                    <span className="text-lobster-text">{row.label}</span>
                    <Link
                      href={`https://sepolia.basescan.org/address/${row.addr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-lobster-primary hover:text-lobster-hover"
                    >
                      <span className="font-mono text-sm">{formatAddress(row.addr)}</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6 lg:sticky lg:top-24 h-fit">
            {/* Deposit card */}
            <div className="card">
              <div className="flex items-center space-x-2 mb-6">
                <DollarSign className="w-5 h-5 text-lobster-primary" />
                <h2 className="font-display text-2xl font-semibold text-lobster-dark">Invest in this Agent</h2>
              </div>

              {!isConnected ? (
                <div className="text-center py-8">
                  <Wallet className="w-12 h-12 text-lobster-text mx-auto mb-4" />
                  <p className="text-lobster-text">Connect your wallet to invest in this pool</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-lobster-text mb-2">Amount (USDC)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lobster-text font-medium">$</span>
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="0.00"
                        className="input-field pl-8"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    {depositAmount && (
                      <p className="text-sm text-lobster-text mt-2">&asymp; {estimatedShares} shares</p>
                    )}
                  </div>

                  <button
                    onClick={handleApprove}
                    disabled={!depositAmount || approveTx.status === "pending" || approveTx.status === "success"}
                    className={cn(
                      "btn-primary w-full",
                      approveTx.status === "success" && "bg-[#0000ff] hover:bg-[#0000ff]/80"
                    )}
                  >
                    {approveTx.status === "pending" ? (
                      <span className="flex items-center justify-center space-x-2"><Loader2 className="w-4 h-4 animate-spin" /><span>Approving...</span></span>
                    ) : approveTx.status === "success" ? (
                      <span className="flex items-center justify-center space-x-2"><CheckCircle className="w-4 h-4" /><span>Approved</span></span>
                    ) : "Approve USDC"}
                  </button>

                  {approveTx.hash && (
                    <Link href={getBaseScanUrl(approveTx.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1 text-sm text-lobster-primary hover:text-lobster-hover">
                      <span>View transaction</span><ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                  {approveTx.error && (
                    <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{approveTx.error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleDeposit}
                    disabled={!depositAmount || approveTx.status !== "success" || depositTx.status === "pending"}
                    className="btn-primary w-full bg-[#0000ff] hover:bg-[#0000ff]/80"
                  >
                    {depositTx.status === "pending" ? (
                      <span className="flex items-center justify-center space-x-2"><Loader2 className="w-4 h-4 animate-spin" /><span>Depositing...</span></span>
                    ) : "Deposit"}
                  </button>

                  {depositTx.hash && (
                    <Link href={getBaseScanUrl(depositTx.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1 text-sm text-lobster-primary hover:text-lobster-hover">
                      <span>View transaction</span><ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                  {depositTx.error && (
                    <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{depositTx.error}</p>
                    </div>
                  )}
                  {depositTx.status === "success" && (
                    <div className="flex items-start space-x-2 p-3 bg-[#0000ff]/10 border border-[#0000ff]/20 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-[#0000ff] flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-[#0000ff]">Deposit successful!</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Your Position card */}
            {userPosition && userPosition.shares > BigInt(0) && (
              <div className="card">
                <div className="flex items-center space-x-2 mb-6">
                  <Wallet className="w-5 h-5 text-lobster-primary" />
                  <h2 className="font-display text-2xl font-semibold text-lobster-dark">Your Position</h2>
                </div>

                <div className="space-y-4">
                  <div className="bg-[#F7F5F9] border border-[#E7E1EA] rounded-xl p-4">
                    <p className="text-sm text-lobster-text mb-1">Shares Held</p>
                    <p className="font-display text-2xl font-bold text-lobster-dark">{formatShares(userPosition.shares)}</p>
                  </div>
                  <div className="bg-[#F7F5F9] border border-[#E7E1EA] rounded-xl p-4">
                    <p className="text-sm text-lobster-text mb-1">Value</p>
                    <p className="font-display text-2xl font-bold text-lobster-dark">${formatUSDC(userPosition.assetsValue)}</p>
                  </div>

                  <div
                    className={cn(
                      "flex items-center space-x-2 p-3 rounded-lg",
                      userPosition.isLocked
                        ? "bg-orange-50 border border-orange-200"
                        : "bg-[#0000ff]/10 border border-[#0000ff]/20"
                    )}
                  >
                    {userPosition.isLocked ? (
                      <>
                        <Lock className="w-4 h-4 text-orange-600" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-orange-900">Locked until</p>
                          <p className="text-xs text-orange-700">{new Date(Number(userPosition.unlockTime) * 1000).toLocaleDateString()}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-4 h-4 text-[#0000ff]" />
                        <p className="text-sm font-medium text-[#0000ff]">Unlocked</p>
                      </>
                    )}
                  </div>

                  <div className="pt-4 border-t border-lobster-border">
                    <label className="block text-sm font-medium text-lobster-text mb-2">Withdraw Amount (USDC)</label>
                    <div className="relative mb-2">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lobster-text font-medium">$</span>
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="0.00"
                        className="input-field pl-8"
                        step="0.01"
                        min="0"
                        disabled={userPosition.isLocked}
                      />
                    </div>
                    <button
                      onClick={() => setWithdrawAmount(formatUSDC(userPosition.maxWithdraw))}
                      disabled={userPosition.isLocked}
                      className="text-sm text-lobster-primary hover:text-lobster-hover font-medium mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Max: ${formatUSDC(userPosition.maxWithdraw)}
                    </button>

                    <button
                      onClick={handleWithdraw}
                      disabled={userPosition.isLocked || !withdrawAmount || withdrawTx.status === "pending"}
                      className="btn-primary w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {withdrawTx.status === "pending" ? (
                        <span className="flex items-center justify-center space-x-2"><Loader2 className="w-4 h-4 animate-spin" /><span>Withdrawing...</span></span>
                      ) : "Withdraw"}
                    </button>

                    {withdrawTx.hash && (
                      <Link href={getBaseScanUrl(withdrawTx.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1 text-sm text-lobster-primary hover:text-lobster-hover mt-2">
                        <span>View transaction</span><ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                    {withdrawTx.error && (
                      <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">{withdrawTx.error}</p>
                      </div>
                    )}
                    {withdrawTx.status === "success" && (
                      <div className="flex items-start space-x-2 p-3 bg-[#0000ff]/10 border border-[#0000ff]/20 rounded-lg mt-2">
                        <CheckCircle className="w-4 h-4 text-[#0000ff] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[#0000ff]">Withdrawal successful!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
