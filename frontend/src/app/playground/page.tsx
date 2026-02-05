"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useServiceRegistry } from "@/hooks/useServiceRegistry";
import { useX402Payment } from "@/hooks/useX402Payment";
import { ServiceTester } from "@/components/ServiceTester";
import { PaymentConfirm } from "@/components/PaymentConfirm";
import { Service, PaymentInfo, SERVICE_TYPE_LABELS } from "@/types";
import { formatUSDC } from "@/lib/utils";
import { ChevronDown, Info, AlertCircle } from "lucide-react";
import { useAccount } from "wagmi";

function getProxyResourceId(service: Service): string {
  // Use the bytes32 hex ID — matches the on-chain serviceId
  // and what the register page uses as the proxy resource ID.
  return service.id;
}

function getServiceLabel(service: Service): string {
  if (service.name) return service.name;
  const typeLabel = SERVICE_TYPE_LABELS[service.serviceType] ?? "Service";
  const shortId = service.id.slice(0, 10) + "...";
  return `${typeLabel} ${shortId}`;
}

function PlaygroundContent() {
  const { address, isConnected } = useAccount();
  const searchParams = useSearchParams();
  const { services, isLoading: servicesLoading } = useServiceRegistry();
  const { makePayment, isLoading: paymentLoading, error: paymentError, proxyUrl } = useX402Payment();

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-select service from query param (e.g. /playground?service=0x...)
  useEffect(() => {
    const serviceId = searchParams.get("service");
    if (serviceId && services.length > 0 && !selectedService) {
      const match = services.find((s) => s.id === serviceId);
      if (match) setSelectedService(match);
    }
  }, [searchParams, services, selectedService]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{
    method: string;
    headers: Record<string, string>;
    body?: string;
  } | null>(null);

  const [response, setResponse] = useState<{
    status: number;
    headers: Record<string, string>;
    body: unknown;
  } | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const handleServiceSelect = (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    setSelectedService(service || null);
    setResponse(null);
    setRequestError(null);
    setIsDropdownOpen(false);
  };

  const handleExecute = async (
    method: string,
    headers: Record<string, string>,
    body?: string
  ) => {
    if (!selectedService) return;

    setPendingRequest({ method, headers, body });
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedService || !pendingRequest) return;

    try {
      setResponse(null);
      setRequestError(null);

      const resourceId = getProxyResourceId(selectedService);
      const result = await makePayment(
        resourceId,
        pendingRequest.method as "GET" | "POST",
        pendingRequest.body ? JSON.parse(pendingRequest.body) : undefined,
        { headers: pendingRequest.headers }
      );

      setResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: result,
      });

      setShowPaymentModal(false);
      setPendingRequest(null);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Request failed");
      setShowPaymentModal(false);
    }
  };

  const paymentInfo: PaymentInfo | null = selectedService
    ? {
        service: selectedService,
        calls: 1,
        totalCost: selectedService.pricePerCall,
      }
    : null;

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-display text-5xl font-bold text-lobster-dark mb-4">
            API Playground
          </h1>
          <p className="text-xl text-lobster-text max-w-3xl">
            Test and interact with services directly in your browser. Payments are
            handled automatically via x402.
          </p>
        </div>

        {/* Connection Warning */}
        {!isConnected && (
          <div className="card bg-yellow-50 border-2 border-yellow-200 mb-8">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900 mb-1">
                  Wallet Not Connected
                </h3>
                <p className="text-sm text-yellow-800">
                  Please connect your wallet to test services with automatic payments.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left Panel - Service Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Service Selector */}
            <div className="card">
              <h2 className="font-display text-xl font-semibold text-lobster-dark mb-4">
                Select Service
              </h2>

              {servicesLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="skeleton h-12 w-full" />
                  ))}
                </div>
              ) : (
                <div className="relative" ref={dropdownRef}>
                  {/* Custom Dropdown Trigger */}
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full input-field text-left pr-10 flex items-center justify-between"
                  >
                    <span
                      className={
                        selectedService ? "text-lobster-dark" : "text-lobster-text"
                      }
                    >
                      {selectedService
                        ? getServiceLabel(selectedService)
                        : "Select a service..."}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-lobster-text transition-transform duration-200 ${
                        isDropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {/* Custom Dropdown Panel */}
                  {isDropdownOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white border-2 border-lobster-border rounded-xl shadow-xl max-h-64 overflow-y-auto">
                      {services.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-lobster-text">
                          No services available
                        </div>
                      ) : (
                        services.map((service) => {
                          const isSelected = selectedService?.id === service.id;
                          return (
                            <button
                              key={service.id}
                              type="button"
                              onClick={() => handleServiceSelect(service.id)}
                              className={`w-full px-4 py-3 text-left transition-colors duration-200 ${
                                isSelected
                                  ? "bg-lobster-primary/10 text-lobster-primary font-medium"
                                  : "text-lobster-dark hover:bg-lobster-surface"
                              }`}
                            >
                              {getServiceLabel(service)}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Service Details */}
            {selectedService && (
              <div className="card overflow-hidden">
                <h3 className="font-display text-lg font-semibold text-lobster-dark mb-4">
                  Service Details
                </h3>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-lobster-text mb-1">Service Name</p>
                    <p className="font-medium text-lobster-dark">
                      {selectedService.name || "Unnamed Service"}
                    </p>
                  </div>

                  {selectedService.description && (
                    <div>
                      <p className="text-xs text-lobster-text mb-1">Description</p>
                      <p className="text-sm text-lobster-dark">
                        {selectedService.description}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-lobster-text mb-1">Endpoint</p>
                    <p className="text-sm font-mono text-lobster-dark break-all">
                      {selectedService.endpoint}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-lobster-text mb-1">Proxy URL</p>
                    <p className="text-sm font-mono text-lobster-dark break-all">
                      {proxyUrl}/proxy/{getProxyResourceId(selectedService)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-lobster-text mb-1">Price per Call</p>
                    <p className="text-2xl font-display font-bold text-lobster-primary">
                      ${formatUSDC(selectedService.pricePerCall)}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-lobster-border">
                    <div className="flex items-start space-x-2 text-sm text-lobster-text">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <p>
                        Payment will be processed automatically when you execute the
                        request.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Service Tester */}
          <div className="lg:col-span-3">
            {!selectedService ? (
              <div className="card text-center py-16">
                <div className="w-24 h-24 bg-lobster-surface rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="material-icons text-5xl text-lobster-text">
                    play_circle
                  </span>
                </div>
                <h3 className="font-display text-2xl font-bold text-lobster-dark mb-3">
                  Select a Service
                </h3>
                <p className="text-lobster-text">
                  Choose a service from the dropdown to start testing
                </p>
              </div>
            ) : (
              <ServiceTester
                service={selectedService}
                onExecute={handleExecute}
                isLoading={paymentLoading}
                response={response}
                error={requestError || paymentError?.message}
              />
            )}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {paymentInfo && (
        <PaymentConfirm
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setPendingRequest(null);
          }}
          onConfirm={handleConfirmPayment}
          paymentInfo={paymentInfo}
        />
      )}
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <Suspense>
      <PlaygroundContent />
    </Suspense>
  );
}
