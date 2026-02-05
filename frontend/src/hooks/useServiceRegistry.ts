"use client";

import { useState, useEffect, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { Service, ServiceType } from "@/types";
import {
  SERVICE_REGISTRY_ADDRESS,
  SERVICE_REGISTRY_ABI,
} from "@/lib/contracts";

export function useServiceRegistry() {
  const publicClient = usePublicClient();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchServices = useCallback(async () => {
    if (!publicClient) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const count = await publicClient.readContract({
        address: SERVICE_REGISTRY_ADDRESS,
        abi: SERVICE_REGISTRY_ABI,
        functionName: "getServiceCount",
      });

      const fetched: Service[] = [];
      for (let i = BigInt(0); i < count; i++) {
        const serviceId = await publicClient.readContract({
          address: SERVICE_REGISTRY_ADDRESS,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getServiceIdAt",
          args: [i],
        });
        const data = await publicClient.readContract({
          address: SERVICE_REGISTRY_ADDRESS,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getService",
          args: [serviceId],
        });
        fetched.push({
          id: serviceId,
          owner: data.owner,
          pricePerCall: data.pricePerCall,
          endpoint: data.endpoint,
          serviceType: data.serviceType as ServiceType,
          active: data.active,
          totalCalls: data.totalCalls,
          totalRevenue: data.totalRevenue,
        });
      }
      setServices(fetched);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch services")
      );
    } finally {
      setIsLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  return {
    services,
    isLoading,
    error,
    refetch: fetchServices,
  };
}
