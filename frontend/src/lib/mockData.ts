import { Service, ServiceType, Transaction, SpendingPolicy, DailySpend } from "@/types";

export const mockServices: Service[] = [
  {
    id: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    name: "GPT-4 Inference API",
    description: "High-quality language model inference with GPT-4",
    owner: "0x1234567890123456789012345678901234567890",
    pricePerCall: BigInt("1000000"), // 1 USDC (6 decimals)
    endpoint: "https://api.example.com/gpt4",
    serviceType: ServiceType.API,
    active: true,
    totalCalls: BigInt("15420"),
    totalRevenue: BigInt("15420000000"),
  },
  {
    id: "0x2234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    name: "Image Generation Service",
    description: "AI-powered image generation and editing",
    owner: "0x2234567890123456789012345678901234567890",
    pricePerCall: BigInt("2500000"), // 2.5 USDC
    endpoint: "https://api.example.com/image-gen",
    serviceType: ServiceType.COMPUTE,
    active: true,
    totalCalls: BigInt("8932"),
    totalRevenue: BigInt("22330000000"),
  },
  {
    id: "0x3234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    name: "Decentralized Storage",
    description: "IPFS-based distributed file storage with redundancy",
    owner: "0x3234567890123456789012345678901234567890",
    pricePerCall: BigInt("500000"), // 0.5 USDC per GB
    endpoint: "https://storage.example.com",
    serviceType: ServiceType.STORAGE,
    active: true,
    totalCalls: BigInt("42156"),
    totalRevenue: BigInt("21078000000"),
  },
  {
    id: "0x4234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    name: "Autonomous Trading Agent",
    description: "AI agent that executes DeFi trading strategies",
    owner: "0x4234567890123456789012345678901234567890",
    pricePerCall: BigInt("5000000"), // 5 USDC per execution
    endpoint: "https://agent.example.com/trade",
    serviceType: ServiceType.AGENT,
    active: true,
    totalCalls: BigInt("3241"),
    totalRevenue: BigInt("16205000000"),
  },
  {
    id: "0x5234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    name: "Data Analysis API",
    description: "Real-time blockchain data analytics and insights",
    owner: "0x5234567890123456789012345678901234567890",
    pricePerCall: BigInt("750000"), // 0.75 USDC
    endpoint: "https://analytics.example.com",
    serviceType: ServiceType.API,
    active: true,
    totalCalls: BigInt("28654"),
    totalRevenue: BigInt("21490500000"),
  },
  {
    id: "0x6234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    name: "MCP Weather Service",
    description: "Weather data and forecasting via MCP protocol",
    owner: "0x6234567890123456789012345678901234567890",
    pricePerCall: BigInt("100000"), // 0.1 USDC
    endpoint: "https://weather.example.com/mcp",
    serviceType: ServiceType.OTHER,
    active: true,
    totalCalls: BigInt("67823"),
    totalRevenue: BigInt("6782300000"),
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: "1",
    date: new Date("2026-02-03T14:32:00Z"),
    service: "GPT-4 Inference API",
    amount: "1.00",
    method: "x402",
    status: "success",
    txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  },
  {
    id: "2",
    date: new Date("2026-02-03T12:15:00Z"),
    service: "Image Generation Service",
    amount: "2.50",
    method: "Gateway",
    status: "success",
    txHash: "0xbcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678901",
  },
  {
    id: "3",
    date: new Date("2026-02-02T18:47:00Z"),
    service: "Decentralized Storage",
    amount: "0.50",
    method: "x402",
    status: "success",
    txHash: "0xcdef1234567890abcdef1234567890abcdef1234567890abcdef123456789012",
  },
  {
    id: "4",
    date: new Date("2026-02-02T09:21:00Z"),
    service: "Autonomous Trading Agent",
    amount: "5.00",
    method: "Gateway",
    status: "success",
    txHash: "0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890123",
  },
  {
    id: "5",
    date: new Date("2026-02-01T16:08:00Z"),
    service: "Data Analysis API",
    amount: "0.75",
    method: "x402",
    status: "success",
    txHash: "0xef1234567890abcdef1234567890abcdef1234567890abcdef12345678901234",
  },
];

export const mockSpendingPolicy: SpendingPolicy = {
  dailyLimit: BigInt("100000000"), // 100 USDC
  expiresAt: BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60), // 30 days from now
  requiresApprovalAbove: BigInt("10000000"), // 10 USDC
  allowedTargets: [
    "0x1234567890123456789012345678901234567890",
    "0x2234567890123456789012345678901234567890",
    "0x3234567890123456789012345678901234567890",
  ],
  allowedTokens: ["0x036CbD53842c5426634e7929541eC2318f3dCF7e"], // USDC
};

export const mockDailySpend: DailySpend = {
  amount: BigInt("45250000"), // 45.25 USDC spent today
  lastReset: BigInt(Math.floor(Date.now() / 1000) - 6 * 60 * 60), // Reset 6 hours ago
};
