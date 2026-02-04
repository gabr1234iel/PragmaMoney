import type { Resource, ServiceType, ResourcePricing } from "../types/x402.js";

/**
 * Helper to create a Resource object with a generated proxy URL.
 */
export function createResource(params: {
  id: string;
  name: string;
  type: ServiceType;
  creatorAddress: string;
  originalUrl: string;
  pricing: ResourcePricing;
}): Resource {
  return {
    id: params.id,
    name: params.name,
    type: params.type,
    creatorAddress: params.creatorAddress,
    originalUrl: params.originalUrl,
    proxyUrl: `/proxy/${params.id}`,
    pricing: params.pricing,
  };
}

/**
 * Validate that a resource has the minimum required fields.
 */
export function isValidResource(
  r: Partial<Resource>
): r is Omit<Resource, "proxyUrl"> {
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.type === "string" &&
    typeof r.creatorAddress === "string" &&
    typeof r.originalUrl === "string" &&
    r.pricing !== undefined &&
    typeof r.pricing.pricePerCall === "string" &&
    r.pricing.currency === "USDC"
  );
}
