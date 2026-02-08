import { Address } from "viem";

// Contract addresses on Base Sepolia (deployed)
// Real USDC — required by x402 facilitator (EIP-3009 support)
export const USDC_ADDRESS: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const GATEWAY_ADDRESS: Address = "0x59bda9849C4eB742eC7Bb2A0Ee61F84e1278168E";
export const SERVICE_REGISTRY_ADDRESS: Address = "0x63B0997740B5828B3e58979D90AE5a6014988d55";
export const AGENT_FACTORY_ADDRESS: Address = "0xf4E7B1B5B67C0E986312F3de580D291E21Fe6998";

// AgentFactory (Launchpad pool factory) — deployed by DeployAgentFactory script
export const AGENT_POOL_FACTORY_ADDRESS: Address = "0x043254035CE6aef612491E30a16479fb51A1f8bA";

export const AGENT_POOL_FACTORY_ABI = [
  {
    type: "function",
    name: "agentCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentIdAt",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "poolByAgentId",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createAgentPool",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "agentAccount", type: "address" },
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "agentURI", type: "string" },
          { name: "asset", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "poolOwner", type: "address" },
          { name: "dailyCap", type: "uint256" },
          { name: "vestingDuration", type: "uint64" },
          { name: "metadataURI", type: "string" },
        ],
      },
    ],
    outputs: [{ name: "pool", type: "address" }],
    stateMutability: "nonpayable",
  },
] as const;

export const IDENTITY_REGISTRY_ADDRESS: Address = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export const REPUTATION_REGISTRY_ADDRESS: Address = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
export const SCORE_ORACLE_ADDRESS: Address = "0x0ECD001c9Abd4B7A8bCF2a89A1AA064Da1B0236f";

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
      { name: "agentId", type: "uint256" },
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
          { name: "agentId", type: "uint256" },
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
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
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
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
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
    name: "isTargetAllowed",
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

export const AGENT_POOL_ABI = [
  // ERC-20 / ERC-4626 standard
  { type: "function", name: "name", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ name: "", type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "asset", inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  { type: "function", name: "totalAssets", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "convertToAssets", inputs: [{ name: "shares", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "convertToShares", inputs: [{ name: "assets", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "previewDeposit", inputs: [{ name: "assets", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "previewWithdraw", inputs: [{ name: "assets", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "maxWithdraw", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "maxRedeem", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  {
    type: "function", name: "deposit",
    inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }],
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "withdraw",
    inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }],
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  // Pool-specific
  { type: "function", name: "agentId", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "dailyCap", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "remainingCapToday", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "spentToday", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "vestingDuration", inputs: [], outputs: [{ name: "", type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "agentRevoked", inputs: [], outputs: [{ name: "", type: "bool" }], stateMutability: "view" },
  { type: "function", name: "isUserLocked", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "bool" }], stateMutability: "view" },
  { type: "function", name: "getUserUnlockTime", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "metadataURI", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const;
