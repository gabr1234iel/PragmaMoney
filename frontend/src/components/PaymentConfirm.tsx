"use client";

import { useState } from "react";
import { X, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { formatUSDC } from "@/lib/utils";
import { PaymentInfo } from "@/types";
import { useBalance, useAccount } from "wagmi";
import { USDC_ADDRESS } from "@/lib/contracts";
import { Address } from "viem";

interface PaymentConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  paymentInfo: PaymentInfo;
}

export function PaymentConfirm({
  isOpen,
  onClose,
  onConfirm,
  paymentInfo,
}: PaymentConfirmProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { address } = useAccount();
  const { data: usdcBalance } = useBalance({
    address: address as Address,
    token: USDC_ADDRESS,
  });

  const handleConfirm = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      await onConfirm();
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      onClose();
      setError(null);
      setSuccess(false);
    }
  };

  if (!isOpen) return null;

  const hasInsufficientBalance =
    usdcBalance && usdcBalance.value < paymentInfo.totalCost;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
          <h2 className="font-display text-2xl font-bold text-slate-900">
            Confirm Payment
          </h2>
          {!isProcessing && (
            <button
              onClick={handleClose}
              className="p-2 hover:bg-lobster-surface rounded-lg transition-colors duration-200"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {success ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-[#0000ff] mx-auto mb-4" />
              <h3 className="font-display text-xl font-semibold text-slate-900 mb-2">
                Payment Successful!
              </h3>
              <p className="text-sm text-slate-500">
                Your service call is being processed
              </p>
            </div>
          ) : (
            <>
              {/* Service Info */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h3 className="font-semibold text-slate-900 mb-3">Service Details</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Service:</span>
                    <span className="font-medium text-slate-900">
                      {paymentInfo.service.name || "Unknown Service"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Price per Call:</span>
                    <span className="font-medium text-lobster-primary">
                      ${formatUSDC(paymentInfo.service.pricePerCall)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Number of Calls:</span>
                    <span className="font-medium text-slate-900">
                      {paymentInfo.calls}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Cost */}
              <div className="bg-gradient-lobster rounded-xl p-6 text-white">
                <p className="text-sm opacity-90 mb-2">Total Cost</p>
                <p className="font-display text-4xl font-bold">
                  ${formatUSDC(paymentInfo.totalCost)}
                </p>
                <p className="text-sm opacity-75 mt-1">USDC</p>
              </div>

              {/* Balance Info */}
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Your USDC Balance:</span>
                  <span className="font-semibold text-slate-900">
                    {usdcBalance ? `$${formatUSDC(usdcBalance.value)}` : "Loading..."}
                  </span>
                </div>
                {hasInsufficientBalance && (
                  <div className="mt-3 flex items-start space-x-2 text-red-600">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm">
                      Insufficient balance. You need at least ${formatUSDC(paymentInfo.totalCost)} USDC.
                    </p>
                  </div>
                )}
              </div>

              {/* Gas Estimate */}
              <div className="text-xs text-slate-400 text-center">
                Estimated gas fees: ~$0.01 USD
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                  <div className="flex items-start space-x-2 text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold mb-1">Payment Failed</p>
                      <p className="text-sm">{error}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex space-x-3">
            <button
              onClick={handleClose}
              disabled={isProcessing}
              className="flex-1 btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing || hasInsufficientBalance}
              className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Confirm Payment</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
