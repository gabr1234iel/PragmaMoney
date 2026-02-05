"use client";

import { useAccount, useBalance } from "wagmi";
import { PolicyViewer } from "@/components/PolicyViewer";
import { TransactionHistory } from "@/components/TransactionHistory";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { USDC_ADDRESS } from "@/lib/contracts";
import { formatUSDC } from "@/lib/utils";
import { Wallet, DollarSign, TrendingUp, Activity, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Address } from "viem";
import Image from "next/image";

export default function DashboardPage() {
  const { address, isConnected } = useAccount();

  const { data: ethBalance } = useBalance({
    address: address as Address,
  });

  const { data: usdcBalance } = useBalance({
    address: address as Address,
    token: USDC_ADDRESS,
  });

  if (!isConnected) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card text-center py-16 max-w-2xl mx-auto">
            <div className="w-24 h-24 bg-lobster-surface rounded-full flex items-center justify-center mx-auto mb-6">
              <Wallet className="w-12 h-12 text-lobster-text" />
            </div>
            <h2 className="font-display text-3xl font-bold text-lobster-dark mb-4">
              Connect Your Wallet
            </h2>
            <p className="text-lobster-text mb-8">
              Connect your wallet to view your dashboard, transaction history, and
              spending policy.
            </p>
            <p className="text-sm text-lobster-text">
              Click the "Connect Wallet" button in the navigation bar to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 relative">
      {/* Floating Mascots */}
      <div className="absolute top-20 right-10 pointer-events-none hidden xl:block rotate-12 drop-shadow-lg">
        <Image src="/picture.png" alt="" width={80} height={80} />
      </div>

      <div className="absolute bottom-40 left-12 pointer-events-none hidden lg:block -rotate-6 drop-shadow-lg">
        <Image src="/picture.png" alt="" width={70} height={70} />
      </div>

      <div className="absolute top-1/2 right-20 pointer-events-none hidden xl:block rotate-45 drop-shadow-lg">
        <Image src="/picture.png" alt="" width={60} height={60} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-display text-5xl font-bold text-lobster-dark mb-4">
            Dashboard
          </h1>
          <p className="text-xl text-lobster-text">
            Monitor your balances, spending policy, and transaction activity
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* ETH Balance */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="material-icons text-blue-600">account_balance_wallet</span>
              </div>
              <h3 className="font-semibold text-lobster-text">ETH Balance</h3>
            </div>
            {ethBalance ? (
              <p className="font-display text-3xl font-bold text-lobster-dark">
                {parseFloat(ethBalance.formatted).toFixed(4)}
              </p>
            ) : (
              <div className="skeleton h-10 w-32" />
            )}
            <p className="text-sm text-lobster-text mt-1">Base Sepolia</p>
          </div>

          {/* USDC Balance */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-lobster-surface rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-lobster-primary" />
              </div>
              <h3 className="font-semibold text-lobster-text">USDC Balance</h3>
            </div>
            {usdcBalance ? (
              <p className="font-display text-3xl font-bold text-lobster-primary">
                ${formatUSDC(usdcBalance.value)}
              </p>
            ) : (
              <div className="skeleton h-10 w-32" />
            )}
            <p className="text-sm text-lobster-text mt-1">Circle USD Coin</p>
          </div>

          {/* Total Spent */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold text-lobster-text">Total Spent</h3>
            </div>
            <p className="font-display text-3xl font-bold text-lobster-dark">$45.25</p>
            <p className="text-sm text-lobster-text mt-1">Lifetime</p>
          </div>

          {/* Services Used */}
          <div className="card">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-lobster-text">Services Used</h3>
            </div>
            <p className="font-display text-3xl font-bold text-lobster-dark">5</p>
            <p className="text-sm text-lobster-text mt-1">Unique services</p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="card bg-blue-50 border-2 border-blue-200 mb-8">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">
                Agent Account Not Detected
              </h3>
              <p className="text-sm text-blue-800 mb-3">
                You're using a standard wallet. To enable spending policies and
                autonomous agent features, you need to create an agent account.
              </p>
              <Link
                href="/register"
                className="text-sm font-medium text-blue-700 hover:text-blue-900 underline"
              >
                Learn more about agent accounts →
              </Link>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Spending Policy */}
          <div>
            <PolicyViewer agentAccountAddress={address} />
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3 mb-6">
              <span className="material-icons text-2xl text-lobster-primary">bolt</span>
              <h2 className="font-display text-2xl font-bold text-lobster-dark">
                Quick Actions
              </h2>
            </div>

            <Link href="/marketplace" className="card-hover block">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-lobster-surface rounded-xl flex items-center justify-center">
                  <span className="material-icons text-2xl text-lobster-primary">
                    explore
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lobster-dark mb-1">
                    Browse Marketplace
                  </h3>
                  <p className="text-sm text-lobster-text">
                    Discover new services and APIs
                  </p>
                </div>
                <span className="material-icons text-lobster-text">chevron_right</span>
              </div>
            </Link>

            <Link href="/playground" className="card-hover block">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-lobster-surface rounded-xl flex items-center justify-center">
                  <span className="material-icons text-2xl text-lobster-primary">
                    science
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lobster-dark mb-1">
                    Test in Playground
                  </h3>
                  <p className="text-sm text-lobster-text">
                    Try services before integrating
                  </p>
                </div>
                <span className="material-icons text-lobster-text">chevron_right</span>
              </div>
            </Link>

            <Link href="/register" className="card-hover block">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-lobster-surface rounded-xl flex items-center justify-center">
                  <span className="material-icons text-2xl text-lobster-primary">
                    add_circle
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lobster-dark mb-1">
                    Register Service
                  </h3>
                  <p className="text-sm text-lobster-text">
                    List your API and start earning
                  </p>
                </div>
                <span className="material-icons text-lobster-text">chevron_right</span>
              </div>
            </Link>

            {/* Balance Card */}
            <div className="card bg-gradient-lobster text-white">
              <h3 className="font-semibold mb-4 opacity-90">Wallet Overview</h3>
              <BalanceDisplay address={address} />
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div>
          <TransactionHistory />
        </div>
      </div>
    </div>
  );
}
