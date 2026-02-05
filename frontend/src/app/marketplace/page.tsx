"use client";

import { useState } from "react";
import { ServiceCard } from "@/components/ServiceCard";
import { useServiceRegistry } from "@/hooks/useServiceRegistry";
import { ServiceType, SERVICE_TYPE_LABELS } from "@/types";
import { Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MarketplacePage() {
  const { services, isLoading } = useServiceRegistry();
  const [selectedType, setSelectedType] = useState<ServiceType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredServices = services.filter((service) => {
    const matchesType = selectedType === "all" || service.serviceType === selectedType;
    const matchesSearch =
      searchQuery === "" ||
      service.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.endpoint.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-display text-5xl font-bold text-lobster-dark mb-4">
            Service Marketplace
          </h1>
          <p className="text-xl text-lobster-text max-w-3xl">
            Discover and connect to AI services, APIs, and agent capabilities powered
            by the x402 protocol
          </p>
        </div>

        {/* Search */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-lobster-text" />
            <input
              type="text"
              placeholder="Search services by name, description, or endpoint..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-lobster-border bg-white text-lobster-dark placeholder:text-lobster-text/40 focus:outline-none focus:ring-2 focus:ring-lobster-primary focus:border-transparent transition-all duration-200"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-8 flex items-center space-x-2 overflow-x-auto pb-2 custom-scrollbar">
          <Filter className="w-5 h-5 text-lobster-text flex-shrink-0" />
          <button
            onClick={() => setSelectedType("all")}
            className={cn(
              "px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200",
              selectedType === "all"
                ? "bg-lobster-primary text-white shadow-md"
                : "bg-white text-lobster-dark border-2 border-lobster-border hover:bg-lobster-surface"
            )}
          >
            All Services
          </button>
          {Object.entries(SERVICE_TYPE_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedType(Number(key) as ServiceType)}
              className={cn(
                "px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all duration-200",
                selectedType === Number(key)
                  ? "bg-lobster-primary text-white shadow-md"
                  : "bg-white text-lobster-dark border-2 border-lobster-border hover:bg-lobster-surface"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Results Count */}
        <div className="mb-6 text-lobster-text">
          Showing{" "}
          <span className="font-semibold text-lobster-dark">
            {filteredServices.length}
          </span>{" "}
          {filteredServices.length === 1 ? "service" : "services"}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card space-y-4">
                <div className="skeleton h-6 w-3/4" />
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-20 w-full" />
                <div className="skeleton h-10 w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Services Grid */}
        {!isLoading && filteredServices.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onClick={() => {
                  window.location.href = `/playground?service=${encodeURIComponent(service.id)}`;
                }}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredServices.length === 0 && (
          <div className="card text-center py-16">
            <div className="w-24 h-24 bg-lobster-surface rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="w-12 h-12 text-lobster-text" />
            </div>
            <h3 className="font-display text-2xl font-bold text-lobster-dark mb-3">
              No Services Found
            </h3>
            <p className="text-lobster-text mb-6">
              {searchQuery
                ? "Try adjusting your search or filter criteria"
                : "No services match the selected filter"}
            </p>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedType("all");
                }}
                className="btn-primary"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
