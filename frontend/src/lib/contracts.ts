import { Address } from "viem";

// Contract addresses on Base Sepolia (deployed)
// Real USDC — required by x402 facilitator (EIP-3009 support)
export const USDC_ADDRESS: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
// MockUSDC — used by deployed gateway/registry contracts for testing
export const MOCK_USDC_ADDRESS: Address = "0x00373f3dc69337e9f141d08a68026A63b88F3051";
export const GATEWAY_ADDRESS: Address = "0x0122fEEc4150A67E6df8bC96dbe32a9B056a3E10";
export const SERVICE_REGISTRY_ADDRESS: Address = "0xC6E2C02c7D39c8C42d8B1f6AC45806c2C6b387D0";
export const AGENT_FACTORY_ADDRESS: Address = "0x8B4294B349530d03Fe94C216fc771206637AFDa9";
export const IDENTITY_REGISTRY_ADDRESS: Address = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export const REPUTATION_REGISTRY_ADDRESS: Address = "0x8004B663056A597Dffe9eCcC1965A193B7388713";

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
      { name: "name", type: "string" },
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
          { name: "name", type: "string" },
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

export const IDENTITY_REGISTRY_ABI = [
  {
    inputs: [{ name: "agentURI", type: "string" }],
    name: "register",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgentWallet",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    name: "setAgentWallet",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const AGENT_ACCOUNT_FACTORY_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "dailyLimit", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
    ],
    name: "createAccount",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    name: "getAddress",
    outputs: [{ name: "", type: "address" }],
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
