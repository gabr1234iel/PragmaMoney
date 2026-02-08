import dotenv from "dotenv";
dotenv.config();

export interface Config {
  port: number;
  facilitatorUrl: string;
  gatewayAddress: string;
  gatewayRpcUrl: string;
  usdcAddress: string;
  /** @deprecated Use usdcAddress instead — unified to real Base Sepolia USDC */
  mockUsdcAddress: string;
  allowedOrigins: string[];
  serviceRegistryAddress: string;
  adminToken: string;
  proxySignerKey: string;
  identityRegistryAddress: string;
  agentAccountFactoryAddress: string;
  agentPoolFactoryAddress: string;
  fundAmountEoa: string;
  uniswapUniversalRouterAddress: string;
  superRealFakeUsdcAddress: string;
  bingerTokenAddress: string;
  rfusdcAddress: string;
  reputationReporterAddress: string;
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
    "0x112B51549AeaF1456E2C04aAE92bC9660b604101",
  serviceRegistryAddress:
    process.env.SERVICE_REGISTRY_ADDRESS ||
    "0x70B74F9D67385d363d4bdd3079b72E60f8EcbaFa",
  gatewayRpcUrl:
    process.env.GATEWAY_RPC_URL || "https://sepolia.base.org",
  usdcAddress:
    process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  mockUsdcAddress:
    process.env.MOCK_USDC_ADDRESS || "0x00373f3dc69337e9f141d08a68026A63b88F3051",
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  adminToken: process.env.ADMIN_TOKEN || "",
  proxySignerKey: process.env.PROXY_SIGNER_KEY || "",
  identityRegistryAddress:
    process.env.IDENTITY_REGISTRY_ADDRESS || "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  agentAccountFactoryAddress:
    process.env.AGENT_ACCOUNT_FACTORY_ADDRESS || "0x074d7Bd79eFd2170851435D1bECCC230dB1E151b",
  agentPoolFactoryAddress:
    process.env.AGENT_POOL_FACTORY_ADDRESS || "0x92B5CF0B3D017455e7546AE2473C4711F1f23861",
  fundAmountEoa: process.env.FUND_AMOUNT_EOA || "0.0005",
  uniswapUniversalRouterAddress:
    process.env.UNISWAP_UNIVERSAL_ROUTER_ADDRESS ||
    "0x492E6456D9528771018DeB9E87ef7750EF184104",
  superRealFakeUsdcAddress:
    process.env.SUPER_REAL_FAKE_USDC_ADDRESS ||
    "0x04eAFA8141F06Ff882b5Aa21064cCBd9E48DfbB8",
  bingerTokenAddress:
    process.env.BINGER_TOKEN_ADDRESS ||
    "0xC8308c6bc561A46275256981dd17298c31300595",
  rfusdcAddress:
    process.env.RFUSDC_ADDRESS || "0x8ac2EeF8EA8f63bc6109c22f7c505962B96cEab0",
  reputationReporterAddress:
    process.env.REPUTATION_REPORTER_ADDRESS || "0xC038404e1fe7dc1FBD19773dB922ced6E2a896B8",
};
