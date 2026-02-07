"use client";

import { Agent } from "@/types";
import { formatAddress } from "@/lib/utils";
import { Bot, Wallet, ExternalLink, User, Landmark, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentCardProps {
  agent: Agent;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const hasWallet = agent.walletAddress && agent.walletAddress !== "0x0000000000000000000000000000000000000000";
  const hasPool = agent.poolAddress && agent.poolAddress !== "0x0000000000000000000000000000000000000000";

  let description = "";
  let x402Support = false;
  try {
    if (agent.agentURI) {
      const parsed = JSON.parse(agent.agentURI);
      description = parsed.description || "";
      x402Support = parsed.x402Support || false;
    }
  } catch { /* not JSON */ }

  return (
    <div onClick={onClick} className={cn("card card-hover group", onClick && "cursor-pointer")}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <Bot className="w-5 h-5 text-lobster-primary" />
            <h3 className="font-display text-xl font-semibold text-lobster-dark">
              {agent.name}
            </h3>
          </div>
          <span className="badge border bg-lobster-primary/10 text-lobster-primary border-lobster-primary/20">
            Agent
          </span>
        </div>
        {x402Support && (
          <span className="badge border bg-[#0000ff]/10 text-[#0000ff] border-[#0000ff]/20">
            x402
          </span>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-lobster-text mb-4 line-clamp-2">
          {description}
        </p>
      )}

      {/* Owner & Wallet */}
      <div className="space-y-2 mb-4 pb-4 border-b border-lobster-border">
        <div className="flex items-center space-x-2 text-xs text-lobster-text/60">
          <User className="w-3 h-3" />
          <span>Owner: {formatAddress(agent.owner)}</span>
        </div>
        {hasWallet && (
          <div className="flex items-center space-x-2 text-xs text-lobster-text/60">
            <Wallet className="w-3 h-3" />
            <span>Wallet: {formatAddress(agent.walletAddress)}</span>
          </div>
        )}
        {agent.poolAddress && agent.poolAddress !== "0x0000000000000000000000000000000000000000" && (
          <div className="flex items-center space-x-2 text-xs text-lobster-text/60">
            <Landmark className="w-3 h-3" />
            <span>Pool: {formatAddress(agent.poolAddress)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs text-lobster-text mb-1">Agent ID</p>
          <p className="font-display text-lg font-bold text-lobster-primary">
            #{agent.agentId.toString()}
          </p>
        </div>
        <div className="flex gap-2">
          {hasPool ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); window.location.href = `/pool/${agent.poolAddress}`; }}
                className="flex items-center space-x-1 px-3 py-2 bg-lobster-primary text-white rounded-xl hover:bg-lobster-hover transition-all duration-200 text-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="font-medium">View</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); window.location.href = `/pool/${agent.poolAddress}`; }}
                className="flex items-center space-x-1 px-3 py-2 bg-[#0000ff] text-white rounded-xl hover:bg-[#0000ff]/80 transition-all duration-200 text-sm"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span className="font-medium">Fund</span>
              </button>
            </>
          ) : (
            <button className="flex items-center space-x-2 px-4 py-2 bg-lobster-primary text-white rounded-xl hover:bg-lobster-hover transition-all duration-200 group-hover:scale-105">
              <ExternalLink className="w-4 h-4" />
              <span className="font-medium">View</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
