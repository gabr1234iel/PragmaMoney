import { Router, type Request, type Response } from "express";
import { JsonRpcProvider, Contract } from "ethers";
import { config } from "../config.js";
import { registerResource } from "../services/resourceStore.js";
import type { ServiceType } from "../types/x402.js";

// ---------------------------------------------------------------------------
// ABI (human-readable) — read-only, just getService
// ---------------------------------------------------------------------------

const SERVICE_REGISTRY_ABI = [
  "function getService(bytes32 serviceId) view returns (tuple(uint256 agentId, address owner, string name, uint256 pricePerCall, string endpoint, uint8 serviceType, bool active, uint256 totalCalls, uint256 totalRevenue))",
];

const SERVICE_TYPE_NAMES: Record<number, ServiceType> = {
  0: "COMPUTE",
  1: "STORAGE",
  2: "API",
  3: "AGENT",
  4: "OTHER",
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const registerServiceRouter = Router();

// ---------------------------------------------------------------------------
// POST /register-service
//
// Public route — on-chain existence is the auth.
// Reads the service from ServiceRegistry and creates a proxy resource.
//
// Body: { serviceId: string, originalUrl: string }
// ---------------------------------------------------------------------------

interface RegisterServiceBody {
  serviceId?: string;
  originalUrl?: string;
}

registerServiceRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as RegisterServiceBody;
    const { serviceId, originalUrl } = body;

    if (!serviceId) {
      res.status(400).json({ error: "serviceId is required" });
      return;
    }
    if (!originalUrl) {
      res.status(400).json({ error: "originalUrl is required" });
      return;
    }

    // Read service from on-chain ServiceRegistry
    const provider = new JsonRpcProvider(config.gatewayRpcUrl);
    const registry = new Contract(
      config.serviceRegistryAddress,
      SERVICE_REGISTRY_ABI,
      provider,
    );

    let service: {
      agentId: bigint;
      owner: string;
      name: string;
      pricePerCall: bigint;
      endpoint: string;
      serviceType: number;
      active: boolean;
    };

    try {
      service = await registry.getService(serviceId);
    } catch {
      res.status(404).json({ error: `Service ${serviceId} not found on-chain` });
      return;
    }

    if (!service.active) {
      res.status(400).json({ error: `Service ${serviceId} is not active` });
      return;
    }

    // Map on-chain serviceType (uint8) to string
    const typeId = Number(service.serviceType);
    const serviceType: ServiceType = SERVICE_TYPE_NAMES[typeId] ?? "OTHER";

    // Generate a short resource ID from the serviceId
    const shortId = serviceId.slice(0, 18);

    // Register in proxy resource store
    const resource = registerResource({
      id: shortId,
      name: service.name,
      type: serviceType,
      creatorAddress: service.owner,
      originalUrl,
      pricing: {
        pricePerCall: service.pricePerCall.toString(),
        currency: "USDC",
      },
    });

    console.log(
      `[register-service] Registered service ${service.name} (${serviceId}) → proxy ${resource.proxyUrl}`,
    );

    res.status(201).json({
      success: true,
      serviceId,
      name: service.name,
      proxyUrl: resource.proxyUrl,
      resourceId: resource.id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[register-service] Error:", message);
    res.status(500).json({ error: "Service registration failed", details: message });
  }
});
