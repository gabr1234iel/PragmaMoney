import { Address } from "viem";

// Contract addresses on Base Sepolia
export const USDC_ADDRESS: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const GATEWAY_ADDRESS: Address = "0x0000000000000000000000000000000000000000"; // TODO: Update after deployment
export const SERVICE_REGISTRY_ADDRESS: Address = "0x0000000000000000000000000000000000000000"; // TODO: Update after deployment
export const AGENT_FACTORY_ADDRESS: Address = "0x0000000000000000000000000000000000000000"; // TODO: Update after deployment

// Minimal ABIs for contract interactions
export const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const SERVICE_REGISTRY_ABI = [
  {
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "pricePerCall", type: "uint256" },
      { name: "endpoint", type: "string" },
      { name: "serviceType", type: "uint8" },
    ],
    name: "registerService",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "serviceId", type: "bytes32" }],
    name: "getService",
    outputs: [
      {
        components: [
          { name: "owner", type: "address" },
          { name: "pricePerCall", type: "uint256" },
          { name: "endpoint", type: "string" },
          { name: "serviceType", type: "uint8" },
          { name: "active", type: "bool" },
          { name: "totalCalls", type: "uint256" },
          { name: "totalRevenue", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getServiceCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "index", type: "uint256" }],
    name: "getServiceIdAt",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const X402_GATEWAY_ABI = [
  {
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "calls", type: "uint256" },
    ],
    name: "payForService",
    outputs: [{ name: "paymentId", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "paymentId", type: "bytes32" }],
    name: "verifyPayment",
    outputs: [
      { name: "valid", type: "bool" },
      { name: "payer", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "paymentId", type: "bytes32" }],
    name: "getPayment",
    outputs: [
      {
        components: [
          { name: "payer", type: "address" },
          { name: "serviceId", type: "bytes32" },
          { name: "calls", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "timestamp", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const AGENT_SMART_ACCOUNT_ABI = [
  {
    inputs: [],
    name: "getPolicy",
    outputs: [
      {
        components: [
          { name: "dailyLimit", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
          { name: "requiresApprovalAbove", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "target", type: "address" }],
    name: "getAllowedTarget",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getDailySpend",
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "lastReset", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
