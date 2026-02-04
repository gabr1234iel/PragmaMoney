"use client";

import { useState } from "react";
import { mockTransactions } from "@/lib/mockData";
import { Transaction } from "@/types";
import { formatRelativeTime, getBaseScanUrl, formatAddress } from "@/lib/utils";
import { ExternalLink, CheckCircle, Clock, XCircle, History } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 5;

export function TransactionHistory() {
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const visibleTransactions = mockTransactions.slice(0, visibleCount);
  const hasMore = visibleCount < mockTransactions.length;

  const getStatusIcon = (status: Transaction["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-600 animate-pulse" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getMethodBadge = (method: Transaction["method"]) => {
    return (
      <span
        className={cn(
          "badge text-xs",
          method === "x402"
            ? "bg-purple-100 text-purple-800 border border-purple-200"
            : "bg-blue-100 text-blue-800 border border-blue-200"
        )}
      >
        {method === "x402" ? "x402" : "Gateway"}
      </span>
    );
  };

  if (mockTransactions.length === 0) {
    return (
      <div className="card text-center py-12">
        <History className="w-12 h-12 text-lobster-text/40 mx-auto mb-3" />
        <h3 className="font-display text-lg font-semibold text-lobster-dark mb-2">
          No Transactions Yet
        </h3>
        <p className="text-sm text-lobster-text">
          Your payment history will appear here once you make your first transaction
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3 mb-6">
        <History className="w-6 h-6 text-lobster-primary" />
        <h2 className="font-display text-2xl font-bold text-lobster-dark">
          Transaction History
        </h2>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-lobster-surface">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-lobster-text uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-lobster-text uppercase tracking-wider">
                  Service
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-lobster-text uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-lobster-text uppercase tracking-wider">
                  Method
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-lobster-text uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-lobster-text uppercase tracking-wider">
                  Transaction
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lobster-border">
              {visibleTransactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="hover:bg-lobster-surface/50 transition-colors duration-150"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-lobster-text">
                    {formatRelativeTime(tx.date)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-lobster-dark">
                    {tx.service}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-lobster-primary">
                    ${tx.amount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{getMethodBadge(tx.method)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(tx.status)}
                      <span className="text-sm capitalize text-lobster-text">
                        {tx.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <a
                      href={getBaseScanUrl(tx.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 text-sm text-lobster-primary hover:text-lobster-hover transition-colors duration-200"
                    >
                      <span className="font-mono">{formatAddress(tx.txHash, 4)}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {visibleTransactions.map((tx) => (
          <div key={tx.id} className="card">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-semibold text-lobster-dark mb-1">{tx.service}</h4>
                <p className="text-xs text-lobster-text">{formatRelativeTime(tx.date)}</p>
              </div>
              {getMethodBadge(tx.method)}
            </div>

            <div className="flex justify-between items-center mb-3">
              <span className="text-2xl font-display font-bold text-lobster-primary">
                ${tx.amount}
              </span>
              <div className="flex items-center space-x-2">
                {getStatusIcon(tx.status)}
                <span className="text-sm capitalize text-lobster-text">{tx.status}</span>
              </div>
            </div>

            <a
              href={getBaseScanUrl(tx.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between text-sm text-lobster-primary hover:text-lobster-hover transition-colors duration-200"
            >
              <span className="font-mono">{formatAddress(tx.txHash, 6)}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ))}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
            className="btn-secondary"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
