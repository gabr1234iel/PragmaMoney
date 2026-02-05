import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Resource, ServiceType, ResourcePricing } from "../types/x402.js";
import { createResource } from "../models/Resource.js";

/**
 * Resource / service store with JSON file persistence.
 *
 * Resources describe upstream services that can be reached through the proxy.
 * Each resource has pricing information that the x402Gate middleware uses to
 * build PaymentRequirements.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.resolve(__dirname, "../../data/resources.json");

const store = new Map<string, Resource>();

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function persist(): void {
  const dir = path.dirname(STORE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(Array.from(store.values()), null, 2));
}

function loadFromDisk(): void {
  if (!fs.existsSync(STORE_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8")) as Resource[];
    for (const r of data) store.set(r.id, r);
    console.log(`[resourceStore] Loaded ${data.length} resources from disk`);
  } catch {
    console.warn("[resourceStore] Failed to load resources from disk, starting fresh");
  }
}

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
  apiKey?: string;
  apiKeyHeader?: string;
}): Resource {
  const resource = createResource(params);
  store.set(resource.id, resource);
  persist();
  return resource;
}

export function removeResource(id: string): boolean {
  const result = store.delete(id);
  if (result) persist();
  return result;
}

// ---------------------------------------------------------------------------
// Seed data - pre-populate with sample resources for development / demo
// (only seeds if store is empty after loading from disk)
// ---------------------------------------------------------------------------

function seed(): void {
  registerResource({
    id: "echo-service",
    name: "Echo Service",
    type: "API",
    creatorAddress: "0x000000000000000000000000000000000000dEaD",
    originalUrl: "https://httpbin.org/anything",
    pricing: { pricePerCall: "1000", currency: "USDC" },
  });

  registerResource({
    id: "joke-api",
    name: "Joke API",
    type: "API",
    creatorAddress: "0x000000000000000000000000000000000000dEaD",
    originalUrl: "https://official-joke-api.appspot.com/random_joke",
    pricing: { pricePerCall: "500", currency: "USDC" },
  });

  registerResource({
    id: "weather-mock",
    name: "Weather Mock",
    type: "COMPUTE",
    creatorAddress: "0x000000000000000000000000000000000000dEaD",
    originalUrl: "https://httpbin.org/get",
    pricing: { pricePerCall: "2000", currency: "USDC" },
  });
}

loadFromDisk();
if (store.size === 0) seed();
