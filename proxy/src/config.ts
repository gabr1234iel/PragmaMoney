import dotenv from "dotenv";
dotenv.config();

export interface Config {
  port: number;
  facilitatorUrl: string;
  gatewayAddress: string;
  gatewayRpcUrl: string;
  usdcAddress: string;
  allowedOrigins: string[];
  serviceRegistryAddress: string;
  adminToken: string;
}

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return ["http://localhost:3000", "http://localhost:4402"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config: Config = {
  port: Number(process.env.PORT) || 4402,
  facilitatorUrl:
    process.env.FACILITATOR_URL || "https://x402.org/facilitator",
  gatewayAddress:
    process.env.GATEWAY_ADDRESS ||
    "0x0122fEEc4150A67E6df8bC96dbe32a9B056a3E10",
  serviceRegistryAddress:
    process.env.SERVICE_REGISTRY_ADDRESS ||
    "0xC6E2C02c7D39c8C42d8B1f6AC45806c2C6b387D0",
  gatewayRpcUrl:
    process.env.GATEWAY_RPC_URL || "https://sepolia.base.org",
  usdcAddress:
    process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  adminToken: process.env.ADMIN_TOKEN || "",
};
