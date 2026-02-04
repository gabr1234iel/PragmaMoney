"use client";

import { useState, useEffect } from "react";
import { Service } from "@/types";
import { mockServices } from "@/lib/mockData";

export function useServiceRegistry() {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchServices = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // TODO: Replace with actual contract reads when deployed
      // const count = await readContract({
      //   address: SERVICE_REGISTRY_ADDRESS,
      //   abi: SERVICE_REGISTRY_ABI,
      //   functionName: 'getServiceCount',
      // });
      // ... fetch each service by index

      setServices(mockServices);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch services"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  return {
    services,
    isLoading,
    error,
    refetch: fetchServices,
  };
}
