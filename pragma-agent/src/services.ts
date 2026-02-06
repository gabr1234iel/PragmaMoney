import { JsonRpcProvider, Contract, formatUnits, parseUnits, keccak256, toUtf8Bytes } from "ethers";
import {
  RPC_URL,
  SERVICE_REGISTRY_ADDRESS,
  SERVICE_REGISTRY_ABI,
  USDC_DECIMALS,
  SERVICE_TYPE_NAMES,
  RELAYER_URL,
} from "./config.js";
import { loadOrCreateWallet, requireRegistration } from "./wallet.js";
import { sendUserOp, buildRegisterServiceCall } from "./userop.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceInfo {
  serviceId: string;
  agentId: string;
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
  agentId: bigint;
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
    agentId: raw.agentId.toString(),
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
  action: "list" | "get" | "search" | "register";
  /** Required for 'get' action: the bytes32 serviceId */
  serviceId?: string;
  /** Required for 'search' action: keyword to match against name or type */
  query?: string;
  /** Required for 'register' action: human-readable service name */
  name?: string;
  /** Required for 'register' action: USDC price per call (e.g. "0.001") */
  pricePerCall?: string;
  /** Required for 'register' action: upstream endpoint URL */
  endpoint?: string;
  /** Optional for 'register' action: service type (default: API) */
  serviceType?: string;
  /** Optional: override relayer URL */
  relayerUrl?: string;
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

      case "register": {
        if (!input.name) {
          return JSON.stringify({ error: "name is required for 'register' action." });
        }
        if (!input.pricePerCall) {
          return JSON.stringify({ error: "pricePerCall is required for 'register' action." });
        }
        if (!input.endpoint) {
          return JSON.stringify({ error: "endpoint is required for 'register' action." });
        }

        // Must be registered (have identity + wallet + pool)
        const reg = requireRegistration();
        const walletData = loadOrCreateWallet();

        // Map service type string to uint8
        const typeMap: Record<string, number> = {
          COMPUTE: 0, STORAGE: 1, API: 2, AGENT: 3, OTHER: 4,
        };
        const serviceTypeNum = typeMap[(input.serviceType ?? "API").toUpperCase()] ?? 2;

        // Generate serviceId = keccak256(name-slug-timestamp)
        const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const serviceId = keccak256(toUtf8Bytes(`${slug}-${Date.now()}`)) as `0x${string}`;

        // Price in atomic USDC units (6 decimals)
        const priceAtomic = parseUnits(input.pricePerCall, USDC_DECIMALS);

        // On-chain endpoint routes through the proxy
        const relayerUrl = input.relayerUrl ?? RELAYER_URL;
        const proxyEndpoint = `${relayerUrl}/proxy/${serviceId.slice(0, 18)}`;

        // Build UserOp to call ServiceRegistry.registerService via smart account
        const call = buildRegisterServiceCall(
          serviceId,
          BigInt(reg.agentId),
          input.name,
          priceAtomic,
          proxyEndpoint,
          serviceTypeNum,
        );

        const result = await sendUserOp(
          reg.smartAccount as `0x${string}`,
          walletData.privateKey as `0x${string}`,
          [call],
          { skipSponsorship: true },
        );

        if (!result.success) {
          return JSON.stringify({
            error: "On-chain registerService UserOp failed",
            txHash: result.txHash,
            userOpHash: result.userOpHash,
          });
        }

        // Register with proxy for routing
        let proxyUrl = proxyEndpoint;
        try {
          const proxyRes = await fetch(`${relayerUrl}/register-service`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serviceId, originalUrl: input.endpoint }),
          });
          const proxyJson = await proxyRes.json() as { proxyUrl?: string };
          if (proxyJson.proxyUrl) {
            proxyUrl = proxyJson.proxyUrl;
          }
        } catch {
          // Non-fatal: on-chain registration succeeded, proxy registration can be retried
        }

        return JSON.stringify({
          serviceId,
          name: input.name,
          pricePerCall: input.pricePerCall,
          endpoint: input.endpoint,
          serviceType: input.serviceType ?? "API",
          proxyUrl,
          txHash: result.txHash,
          userOpHash: result.userOpHash,
        });
      }

      default:
        return JSON.stringify({
          error: `Unknown action: ${input.action}. Valid actions: list, get, search, register`,
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
    "Browse, search, and register services on the PragmaMoney ServiceRegistry (Base Sepolia). List all services, get details, search, or register a new service on-chain.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["list", "get", "search", "register"],
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
      name: {
        type: "string" as const,
        description:
          "Human-readable service name. Required for 'register' action.",
      },
      pricePerCall: {
        type: "string" as const,
        description:
          "USDC price per call (e.g. '0.001'). Required for 'register' action.",
      },
      endpoint: {
        type: "string" as const,
        description:
          "Upstream endpoint URL for the service. Required for 'register' action.",
      },
      serviceType: {
        type: "string" as const,
        enum: ["COMPUTE", "STORAGE", "API", "AGENT", "OTHER"],
        description:
          "Service type category. Optional for 'register' (default: API).",
      },
      relayerUrl: {
        type: "string" as const,
        description: "Override the default proxy relayer URL.",
      },
      rpcUrl: {
        type: "string" as const,
        description: "Override the default Base Sepolia RPC URL.",
      },
    },
    required: ["action"],
  },
};
