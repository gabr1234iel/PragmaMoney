"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useState, useRef, useEffect } from "react";
import { Wallet, ChevronDown, LogOut } from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { BalanceDisplay } from "./BalanceDisplay";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isConnected) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="btn-primary flex items-center space-x-2"
        >
          <Wallet className="w-5 h-5" />
          <span>Connect Wallet</span>
        </button>

        {showDropdown && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-lobster-border overflow-hidden z-50">
            <div className="py-1">
              {connectors.map((connector) => (
                <button
                  key={connector.id}
                  onClick={() => {
                    connect({ connector });
                    setShowDropdown(false);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-lobster-surface transition-colors duration-200 flex items-center space-x-3"
                >
                  <Wallet className="w-5 h-5 text-lobster-primary" />
                  <span className="font-medium text-lobster-dark">{connector.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center space-x-3 px-4 py-2 bg-white border-2 border-lobster-border rounded-xl hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
      >
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-lobster rounded-full flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <span className="font-medium text-lobster-dark">
            {formatAddress(address || "")}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 text-lobster-text" />
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-lobster-border overflow-hidden z-50">
          <div className="p-4 border-b border-lobster-border">
            <p className="text-xs text-lobster-text mb-2">Connected Address</p>
            <p className="font-mono text-sm text-lobster-dark">{address}</p>
          </div>

          <div className="p-4 border-b border-lobster-border">
            <BalanceDisplay address={address} />
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              className="w-full px-4 py-3 text-left hover:bg-lobster-surface transition-colors duration-200 flex items-center space-x-3 text-red-600 hover:text-red-700"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
