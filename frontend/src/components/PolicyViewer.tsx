"use client";

import { useWalletPolicy } from "@/hooks/useWalletPolicy";
import { formatUSDC, formatAddress } from "@/lib/utils";
import { Shield, Clock, DollarSign, Target, AlertCircle } from "lucide-react";

interface PolicyViewerProps {
  agentAccountAddress?: string;
}

export function PolicyViewer({ agentAccountAddress }: PolicyViewerProps) {
  const { policy, dailySpend, isLoading, error } = useWalletPolicy(agentAccountAddress);

  if (isLoading) {
    return (
      <div className="card space-y-4">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-20 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card bg-red-50 border-2 border-red-200">
        <div className="flex items-center space-x-3 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <p>Failed to load spending policy</p>
        </div>
      </div>
    );
  }

  if (!policy || !dailySpend) {
    return (
      <div className="card bg-lobster-surface border-2 border-lobster-border">
        <div className="text-center py-8">
          <Shield className="w-12 h-12 text-lobster-text/40 mx-auto mb-3" />
          <h3 className="font-display text-lg font-semibold text-lobster-dark mb-2">
            No Agent Account Found
          </h3>
          <p className="text-sm text-lobster-text">
            Connect a wallet with an agent account to view spending policy
          </p>
        </div>
      </div>
    );
  }

  const spentPercentage = Number((dailySpend.amount * BigInt(100)) / policy.dailyLimit);
  const remainingLimit = policy.dailyLimit - dailySpend.amount;
  const isExpiringSoon = Number(policy.expiresAt) * 1000 < Date.now() + 7 * 24 * 60 * 60 * 1000;
  const expiryDate = new Date(Number(policy.expiresAt) * 1000);

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3 mb-6">
        <Shield className="w-6 h-6 text-lobster-primary" />
        <h2 className="font-display text-2xl font-bold text-lobster-dark">
          Spending Policy
        </h2>
      </div>

      {/* Daily Limit Progress */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-lobster-primary" />
            <h3 className="font-semibold text-lobster-dark">Daily Spending Limit</h3>
          </div>
          <span className="text-sm font-medium text-lobster-text">
            {spentPercentage.toFixed(1)}% used
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="h-3 bg-lobster-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-lobster transition-all duration-500 ease-out"
              style={{ width: `${Math.min(spentPercentage, 100)}%` }}
            />
          </div>
        </div>

        {/* Spent / Limit */}
        <div className="flex justify-between text-sm">
          <span className="text-lobster-text">
            Spent: <span className="font-semibold text-lobster-primary">
              ${formatUSDC(dailySpend.amount)}
            </span>
          </span>
          <span className="text-lobster-text">
            Remaining: <span className="font-semibold text-lobster-dark">
              ${formatUSDC(remainingLimit)}
            </span>
          </span>
        </div>

        <div className="mt-2 text-xs text-lobster-text">
          Daily limit: <span className="font-semibold">${formatUSDC(policy.dailyLimit)}</span>
        </div>
      </div>

      {/* Policy Details */}
      <div className="card space-y-4">
        {/* Expiry */}
        <div className="flex items-start space-x-3">
          <Clock className={`w-5 h-5 flex-shrink-0 ${isExpiringSoon ? 'text-orange-500' : 'text-lobster-primary'}`} />
          <div className="flex-1">
            <h4 className="font-semibold text-lobster-dark mb-1">Policy Expiry</h4>
            <p className="text-sm text-lobster-text">
              {expiryDate.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            {isExpiringSoon && (
              <p className="text-xs text-orange-600 mt-1">
                Policy expires in less than 7 days
              </p>
            )}
          </div>
        </div>

        {/* Approval Threshold */}
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-lobster-primary flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-semibold text-lobster-dark mb-1">Approval Required Above</h4>
            <p className="text-sm text-lobster-text">
              ${formatUSDC(policy.requiresApprovalAbove)} USDC
            </p>
          </div>
        </div>

        {/* Allowed Targets */}
        <div className="flex items-start space-x-3">
          <Target className="w-5 h-5 text-lobster-primary flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-semibold text-lobster-dark mb-2">Allowed Targets</h4>
            {policy.allowedTargets.length === 0 ? (
              <p className="text-sm text-lobster-text italic">No targets allowed</p>
            ) : (
              <div className="space-y-1">
                {policy.allowedTargets.slice(0, 3).map((target, idx) => (
                  <div
                    key={idx}
                    className="text-xs font-mono bg-lobster-surface px-3 py-2 rounded-lg text-lobster-dark"
                  >
                    {formatAddress(target, 6)}
                  </div>
                ))}
                {policy.allowedTargets.length > 3 && (
                  <p className="text-xs text-lobster-text italic">
                    + {policy.allowedTargets.length - 3} more
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
