import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import {
  RPC_URL,
  SERVICE_REGISTRY_ADDRESS,
  SERVICE_REGISTRY_ABI,
  USDC_DECIMALS,
  SERVICE_TYPE_NAMES,
} from "./config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceInfo {
  serviceId: string;
  owner: string;
  name: string;
  pricePerCall: string;
  pricePerCallRaw: string;
  endpoint: string;
  serviceType: string;
  serviceTypeId: number;
  active: boolean;
  totalCalls: string;
  totalRevenue: string;
  totalRevenueFormatted: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRegistry(rpcUrl?: string): Contract {
  const provider = new JsonRpcProvider(rpcUrl ?? RPC_URL);
  return new Contract(SERVICE_REGISTRY_ADDRESS, SERVICE_REGISTRY_ABI, provider);
}

function formatService(serviceId: string, raw: {
  owner: string;
  name: string;
  pricePerCall: bigint;
  endpoint: string;
  serviceType: number;
  active: boolean;
  totalCalls: bigint;
  totalRevenue: bigint;
}): ServiceInfo {
  const typeId = Number(raw.serviceType);
  return {
    serviceId,
    owner: raw.owner,
    name: raw.name,
    pricePerCall: formatUnits(raw.pricePerCall, USDC_DECIMALS),
    pricePerCallRaw: raw.pricePerCall.toString(),
    endpoint: raw.endpoint,
    serviceType: SERVICE_TYPE_NAMES[typeId] ?? `UNKNOWN(${typeId})`,
    serviceTypeId: typeId,
    active: raw.active,
    totalCalls: raw.totalCalls.toString(),
    totalRevenue: raw.totalRevenue.toString(),
    totalRevenueFormatted: formatUnits(raw.totalRevenue, USDC_DECIMALS),
  };
}

// ─── Tool handler ────────────────────────────────────────────────────────────

export interface ServicesInput {
  action: "list" | "get" | "search";
  /** Required for 'get' action: the bytes32 serviceId */
  serviceId?: string;
  /** Required for 'search' action: keyword to match against name or type */
  query?: string;
  /** Optional: override RPC URL */
  rpcUrl?: string;
}

export async function handleServices(input: ServicesInput): Promise<string> {
  try {
    const registry = getRegistry(input.rpcUrl);

    switch (input.action) {
      case "list": {
        const count: bigint = await registry.getServiceCount();
        const total = Number(count);

        if (total === 0) {
          return JSON.stringify({ services: [], total: 0 });
        }

        const services: ServiceInfo[] = [];
        // Fetch all services. For large registries we batch in parallel.
        const batchSize = 20;
        for (let start = 0; start < total; start += batchSize) {
          const end = Math.min(start + batchSize, total);
          const indices = Array.from({ length: end - start }, (_, i) => start + i);

          const batch = await Promise.all(
            indices.map(async (idx) => {
              const serviceId: string = await registry.getServiceIdAt(idx);
              const raw = await registry.getService(serviceId);
              return formatService(serviceId, raw);
            })
          );
          services.push(...batch);
        }

        return JSON.stringify({ services, total });
      }

      case "get": {
        if (!input.serviceId) {
          return JSON.stringify({
            error: "serviceId is required for 'get' action.",
          });
        }

        const raw = await registry.getService(input.serviceId);
        const service = formatService(input.serviceId, raw);
        return JSON.stringify({ service });
      }

      case "search": {
        if (!input.query) {
          return JSON.stringify({
            error: "query is required for 'search' action.",
          });
        }

        const queryLower = input.query.toLowerCase();
        const count: bigint = await registry.getServiceCount();
        const total = Number(count);
        const results: ServiceInfo[] = [];

        const batchSize = 20;
        for (let start = 0; start < total; start += batchSize) {
          const end = Math.min(start + batchSize, total);
          const indices = Array.from({ length: end - start }, (_, i) => start + i);

          const batch = await Promise.all(
            indices.map(async (idx) => {
              const serviceId: string = await registry.getServiceIdAt(idx);
              const raw = await registry.getService(serviceId);
              return formatService(serviceId, raw);
            })
          );

          for (const svc of batch) {
            const nameMatch = svc.name.toLowerCase().includes(queryLower);
            const typeMatch = svc.serviceType.toLowerCase().includes(queryLower);
            const endpointMatch = svc.endpoint.toLowerCase().includes(queryLower);
            if (nameMatch || typeMatch || endpointMatch) {
              results.push(svc);
            }
          }
        }

        return JSON.stringify({
          query: input.query,
          results,
          matchCount: results.length,
          totalServices: total,
        });
      }

      default:
        return JSON.stringify({
          error: `Unknown action: ${input.action}. Valid actions: list, get, search`,
        });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

// ─── Tool schema ─────────────────────────────────────────────────────────────

export const servicesSchema = {
  name: "pragma-services",
  description:
    "Browse and search the PragmaMoney ServiceRegistry on Base Sepolia. List all registered services, get details by serviceId, or search by name/type keyword.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["list", "get", "search"],
        description: "The action to perform on the service registry.",
      },
      serviceId: {
        type: "string" as const,
        description:
          "The bytes32 service identifier. Required for 'get' action.",
      },
      query: {
        type: "string" as const,
        description:
          "Keyword to search against service name, type, or endpoint. Required for 'search' action.",
      },
      rpcUrl: {
        type: "string" as const,
        description: "Override the default Base Sepolia RPC URL.",
      },
    },
    required: ["action"],
  },
};
