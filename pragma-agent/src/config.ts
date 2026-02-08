// ─── Contract Addresses (Base Sepolia, chain 84532) ───────────────────────────

export const CHAIN_ID = 84532;
export const RPC_URL = "https://sepolia.base.org";
export const DEFAULT_PROXY_URL = "http://localhost:4402";

export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const RFUSDC_ADDRESS = "0x8ac2EeF8EA8f63bc6109c22f7c505962B96cEab0";
export const SUPER_FAKE_USDC_ADDRESS = "0x04eAFA8141F06Ff882b5Aa21064cCBd9E48DfbB8";
export const BINGER_TOKEN_ADDRESS = "0xC8308c6bc561A46275256981dd17298c31300595";
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const UNISWAP_UNIVERSAL_ROUTER_ADDRESS =
  "0x492E6456D9528771018DeB9E87ef7750EF184104";
export const REPUTATION_REPORTER_ADDRESS =
  process.env.REPUTATION_REPORTER_ADDRESS ||
  "0x3FB6ed48640ec7B90E6Ff642c533098c5c80d0c4";
export const SERVICE_REGISTRY_ADDRESS = "0x1Ace3c1Ac3E4D849373017B43804Eb515516950E";
export const X402_GATEWAY_ADDRESS = "0x6f29093e31136644BEDd0c4a904d13334Db1e60C";
export const IDENTITY_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export const AGENT_ACCOUNT_FACTORY_ADDRESS = "0xBbC699E79B9fa50E8E7974F07D2ED75D76dFb499";
export const AGENT_POOL_FACTORY_ADDRESS = "0xF6CA25ebA2Dc010d19507D2C6138ba2598B7b974";
export const SCORE_ORACLE_ADDRESS = "0x7F02Fe78627e76D3657529DD814C2881B2F60edC";

// ─── 4337 / Pimlico ──────────────────────────────────────────────────────────

export const ENTRYPOINT_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

export const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY || "";

export const PIMLICO_BUNDLER_URL = PIMLICO_API_KEY
  ? `https://api.pimlico.io/v2/base-sepolia/rpc?apikey=${PIMLICO_API_KEY}`
  : "";

// ─── Proxy / Relayer ─────────────────────────────────────────────────────────
// TODO: Replace DEFAULT_PROXY_URL with stable production URL once deployed
//       (agents on remote VPS need to reach this, not localhost)

export const RELAYER_URL = process.env.RELAYER_URL || DEFAULT_PROXY_URL;

// ─── USDC decimals ────────────────────────────────────────────────────────────

export const USDC_DECIMALS = 6;

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
] as const;

export const RFUSDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address account, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
] as const;

export const SUPER_REAL_FAKE_USDC_ABI = [
  "function upgrade(uint256 amount)",
] as const;

export const UNISWAP_UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands, bytes[] inputs)",
] as const;

export const REPUTATION_REPORTER_ABI = [
  "function giveFeedback(uint256 agentId,int128 value,uint8 valueDecimals,string tag1,string tag2,string endpoint,string feedbackURI,bytes32 feedbackHash)",
] as const;

export const SERVICE_REGISTRY_ABI = [
  // Read service data
  "function getService(bytes32 serviceId) view returns (tuple(uint256 agentId, address owner, string name, uint256 pricePerCall, string endpoint, uint8 serviceType, bool active, uint256 totalCalls, uint256 totalRevenue))",
  "function getAgentId(bytes32 serviceId) view returns (uint256)",
  "function getServiceCount() view returns (uint256)",
  "function getServiceIdAt(uint256 index) view returns (bytes32)",
  // Write
  "function registerService(bytes32 serviceId, uint256 agentId, string name, uint256 pricePerCall, string endpoint, uint8 serviceType)",
  "function recordUsage(bytes32 serviceId, uint256 calls, uint256 revenue)",
] as const;

export const X402_GATEWAY_ABI = [
  "function payForService(bytes32 serviceId, uint256 calls) returns (bytes32 paymentId)",
  "function verifyPayment(bytes32 paymentId) view returns (bool valid, address payer, uint256 amount)",
  "function getPayment(bytes32 paymentId) view returns (tuple(address payer, bytes32 serviceId, uint256 calls, uint256 amount, bool valid))",
  "function usdc() view returns (address)",
  "function serviceRegistry() view returns (address)",
  "function nonce() view returns (uint256)",
  "event ServicePaid(address indexed payer, bytes32 indexed serviceId, uint256 calls, uint256 amount, bytes32 indexed paymentId)",
] as const;

export const AGENT_SMART_ACCOUNT_ABI = [
  // Policy reads
  "function getPolicy() view returns (tuple(uint256 dailyLimit, uint256 expiresAt, uint256 requiresApprovalAbove))",
  "function getDailySpend() view returns (tuple(uint256 amount, uint256 lastReset))",
  "function isTargetAllowed(address target) view returns (bool)",
  "function isTokenAllowed(address token) view returns (bool)",
  "function owner() view returns (address)",
  "function operator() view returns (address)",
  "function agentId() view returns (bytes32)",
  // Execution (for UserOp calldata encoding)
  "function execute(address dest, uint256 value, bytes func)",
  "function executeBatch(address[] dest, uint256[] values, bytes[] func)",
] as const;

export const AGENT_POOL_ABI = [
  // Agent pull
  "function pull(address to, uint256 assets)",
  // ERC-4626 deposit
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  // View functions
  "function remainingCapToday() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function dailyCap() view returns (uint256)",
  "function agentId() view returns (uint256)",
  "function spentToday() view returns (uint256)",
  "function currentDay() view returns (uint64)",
  "function agentRevoked() view returns (bool)",
  "function metadataURI() view returns (string)",
  "function asset() view returns (address)",
  "function allowlistEnabled() view returns (bool)",
  "function allowedPullTarget(address target) view returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
] as const;

// ─── ServiceType enum mapping ─────────────────────────────────────────────────

export const SERVICE_TYPE_NAMES: Record<number, string> = {
  0: "COMPUTE",
  1: "STORAGE",
  2: "API",
  3: "AGENT",
  4: "OTHER",
};

export const IDENTITY_REGISTRY_ABI = [
  "function register(string agentURI) returns (uint256)",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes sig)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
] as const;

export const AGENT_ACCOUNT_FACTORY_ABI = [
  "function createAccount(address owner, address operator, bytes32 agentId, uint256 dailyLimit, uint256 expiresAt) returns (address)",
  "function getAddress(address owner, bytes32 agentId) view returns (address)",
] as const;

export const AGENT_POOL_FACTORY_ABI = [
  "function poolByAgentId(uint256 agentId) view returns (address)",
  "function agentCount() view returns (uint256)",
] as const;
