export enum ServiceType {
  COMPUTE = 0,
  STORAGE = 1,
  API = 2,
  AGENT = 3,
  OTHER = 4,
}

export interface Service {
  id: string;
  owner: string;
  pricePerCall: bigint;
  endpoint: string;
  serviceType: ServiceType;
  active: boolean;
  totalCalls: bigint;
  totalRevenue: bigint;
  name?: string;
  description?: string;
}

export interface SpendingPolicy {
  dailyLimit: bigint;
  expiresAt: bigint;
  requiresApprovalAbove: bigint;
  allowedTargets: string[];
  allowedTokens: string[];
}

export interface DailySpend {
  amount: bigint;
  lastReset: bigint;
}

export interface PaymentResult {
  paymentId: string;
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface Transaction {
  id: string;
  date: Date;
  service: string;
  amount: string;
  method: "x402" | "Gateway";
  status: "success" | "pending" | "failed";
  txHash: string;
}

export interface PaymentInfo {
  service: Service;
  calls: number;
  totalCost: bigint;
}

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  [ServiceType.COMPUTE]: "Compute",
  [ServiceType.STORAGE]: "Storage",
  [ServiceType.API]: "API",
  [ServiceType.AGENT]: "Agent",
  [ServiceType.OTHER]: "Other",
};

export interface Agent {
  agentId: bigint;
  owner: string;
  walletAddress: string;
  agentURI: string;
  name: string;
  poolAddress?: string;
}

export const SERVICE_TYPE_COLORS: Record<ServiceType, string> = {
  [ServiceType.COMPUTE]: "bg-blue-100 text-blue-800 border-blue-200",
  [ServiceType.STORAGE]: "bg-green-100 text-green-800 border-green-200",
  [ServiceType.API]: "bg-lobster-surface text-lobster-primary border-lobster-border",
  [ServiceType.AGENT]: "bg-purple-100 text-purple-800 border-purple-200",
  [ServiceType.OTHER]: "bg-gray-100 text-gray-800 border-gray-200",
};
