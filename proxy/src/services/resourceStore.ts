import type { Resource, ServiceType, ResourcePricing } from "../types/x402.js";
import { createResource } from "../models/Resource.js";

/**
 * In-memory resource / service store.
 *
 * Resources describe upstream services that can be reached through the proxy.
 * Each resource has pricing information that the x402Gate middleware uses to
 * build PaymentRequirements.
 */

const store = new Map<string, Resource>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getResource(id: string): Resource | undefined {
  return store.get(id);
}

export function getAllResources(): Resource[] {
  return Array.from(store.values());
}

export function registerResource(params: {
  id: string;
  name: string;
  type: ServiceType;
  creatorAddress: string;
  originalUrl: string;
  pricing: ResourcePricing;
}): Resource {
  const resource = createResource(params);
  store.set(resource.id, resource);
  return resource;
}

export function removeResource(id: string): boolean {
  return store.delete(id);
}

// ---------------------------------------------------------------------------
// Seed data - pre-populate with sample resources for development / demo
// ---------------------------------------------------------------------------

function seed(): void {
  registerResource({
    id: "echo-service",
    name: "Echo Service",
    type: "API",
    creatorAddress: "0x000000000000000000000000000000000000dEaD",
    originalUrl: "https://httpbin.org/anything",
    pricing: { pricePerCall: "1000", currency: "USDC" }, // 0.001 USDC
  });

  registerResource({
    id: "joke-api",
    name: "Joke API",
    type: "API",
    creatorAddress: "0x000000000000000000000000000000000000dEaD",
    originalUrl: "https://official-joke-api.appspot.com/random_joke",
    pricing: { pricePerCall: "500", currency: "USDC" }, // 0.0005 USDC
  });

  registerResource({
    id: "weather-mock",
    name: "Weather Mock",
    type: "COMPUTE",
    creatorAddress: "0x000000000000000000000000000000000000dEaD",
    originalUrl: "https://httpbin.org/get",
    pricing: { pricePerCall: "2000", currency: "USDC" }, // 0.002 USDC
  });
}

seed();
