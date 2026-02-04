import dotenv from "dotenv";
dotenv.config();

export interface Config {
  port: number;
  facilitatorUrl: string;
  gatewayAddress: string;
  gatewayRpcUrl: string;
  usdcAddress: string;
  allowedOrigins: string[];
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
    "0x0000000000000000000000000000000000000000",
  gatewayRpcUrl:
    process.env.GATEWAY_RPC_URL || "https://sepolia.base.org",
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
};
