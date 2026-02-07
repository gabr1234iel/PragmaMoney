"use client";

import { Service, SERVICE_TYPE_LABELS, SERVICE_TYPE_COLORS } from "@/types";
import { formatUSDC, truncateText } from "@/lib/utils";
import { ExternalLink, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceCardProps {
  service: Service;
  onClick?: () => void;
}

export function ServiceCard({ service, onClick }: ServiceCardProps) {
  const typeLabel = SERVICE_TYPE_LABELS[service.serviceType];
  const typeColor = SERVICE_TYPE_COLORS[service.serviceType];

  return (
    <div
      onClick={onClick}
      className={cn(
        "card-hover group",
        onClick && "cursor-pointer"
      )}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="font-display text-xl font-semibold text-lobster-dark mb-2">
            {service.name || "Unnamed Service"}
          </h3>
          <span className={cn("badge border", typeColor)}>{typeLabel}</span>
        </div>
        {service.active && (
          <div className="flex items-center space-x-1 text-[#0000ff]">
            <span className="w-2 h-2 bg-[#0000ff] rounded-full animate-pulse" />
            <span className="text-xs font-medium">Active</span>
          </div>
        )}
      </div>

      {/* Description */}
      {service.description && (
        <p className="text-sm text-lobster-text mb-4 line-clamp-2">
          {service.description}
        </p>
      )}

      {/* Endpoint */}
      <div className="flex items-center space-x-2 text-xs text-lobster-text/60 mb-4 font-mono">
        <ExternalLink className="w-3 h-3" />
        <span>{truncateText(service.endpoint, 35)}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-lobster-border">
        <div>
          <p className="text-xs text-lobster-text mb-1">Total Calls</p>
          <p className="font-semibold text-lobster-dark">
            {service.totalCalls.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-lobster-text mb-1">Revenue</p>
          <p className="font-semibold text-lobster-primary">
            ${formatUSDC(service.totalRevenue)}
          </p>
        </div>
      </div>

      {/* Price & CTA */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs text-lobster-text mb-1">Price per Call</p>
          <p className="font-display text-2xl font-bold text-lobster-primary">
            ${formatUSDC(service.pricePerCall)}
          </p>
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 bg-lobster-primary text-white rounded-xl hover:bg-lobster-hover transition-all duration-200 group-hover:scale-105">
          <Zap className="w-4 h-4" />
          <span className="font-medium">Use</span>
        </button>
      </div>
    </div>
  );
}
