import { JsonRpcProvider, Wallet, Contract, formatUnits, formatEther } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  RPC_URL,
  USDC_ADDRESS,
  USDC_DECIMALS,
  ERC20_ABI,
  AGENT_SMART_ACCOUNT_ABI,
} from "./config.js";

// ─── Wallet file management ──────────────────────────────────────────────────

const WALLET_DIR = path.join(os.homedir(), ".openclaw", "pragma-agent");
const WALLET_FILE = path.join(WALLET_DIR, "wallet.json");

interface Registration {
  agentId: string;
  smartAccount: string;
  poolAddress: string;
  owner: string;
  registeredAt: string;
  txHashes: Record<string, string>;
}

interface WalletData {
  privateKey: string;
  address: string;
  createdAt: string;
  registration: Registration | null;
}

/**
 * Load or create the agent wallet. On first run, generates a random private key
 * and saves it to ~/.openclaw/pragma-agent/wallet.json. On subsequent runs,
 * loads from the saved file.
 */
function loadOrCreateWallet(): WalletData {
  if (fs.existsSync(WALLET_FILE)) {
    const raw = fs.readFileSync(WALLET_FILE, "utf-8");
    const data = JSON.parse(raw) as WalletData;
    // Handle legacy wallet files without registration field
    if (data.registration === undefined) {
      data.registration = null;
    }
    return data;
  }

  // First run: generate a new wallet
  const randomWallet = Wallet.createRandom();
  const data: WalletData = {
    privateKey: randomWallet.privateKey,
    address: randomWallet.address,
    createdAt: new Date().toISOString(),
    registration: null,
  };

  fs.mkdirSync(WALLET_DIR, { recursive: true });
  fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), "utf-8");
  return data;
}

/**
 * Save registration data to the wallet file.
 */
function saveRegistration(reg: Registration): void {
  const data = loadOrCreateWallet();
  data.registration = reg;
  fs.writeFileSync(WALLET_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Get registration data, or null if not registered.
 */
function getRegistration(): Registration | null {
  const data = loadOrCreateWallet();
  return data.registration;
}

/**
 * Get registration data, throwing if not registered.
 */
function requireRegistration(): Registration {
  const reg = getRegistration();
  if (!reg) {
    throw new Error("Agent not registered. Call pragma-register first.");
  }
  return reg;
}

/**
 * Get a connected Wallet instance backed by the agent's private key.
 */
function getSignerWallet(rpcUrl?: string): Wallet {
  const data = loadOrCreateWallet();
  const provider = new JsonRpcProvider(rpcUrl ?? RPC_URL);
  return new Wallet(data.privateKey, provider);
}

// ─── Tool handler ────────────────────────────────────────────────────────────

export interface WalletInput {
  action: "getBalance" | "getAddress" | "getPolicy";
  /** Optional: address of an AgentSmartAccount (for getPolicy). Defaults to registered smart account. */
  smartAccountAddress?: string;
  /** Optional: override RPC URL */
  rpcUrl?: string;
}

export async function handleWallet(input: WalletInput): Promise<string> {
  try {
    const rpcUrl = input.rpcUrl ?? RPC_URL;
    const walletData = loadOrCreateWallet();

    switch (input.action) {
      case "getAddress": {
        const reg = walletData.registration;
        return JSON.stringify({
          eoaAddress: walletData.address,
          smartAccountAddress: reg?.smartAccount ?? null,
          agentId: reg?.agentId ?? null,
          poolAddress: reg?.poolAddress ?? null,
          registered: reg !== null,
          walletFile: WALLET_FILE,
          createdAt: walletData.createdAt,
        });
      }

      case "getBalance": {
        const provider = new JsonRpcProvider(rpcUrl);
        const eoaAddress = walletData.address;
        const reg = walletData.registration;

        // Always fetch EOA ETH balance
        const ethBalance = await provider.getBalance(eoaAddress);

        // Fetch USDC balance from smart account if registered, else EOA
        const balanceAddress = reg?.smartAccount ?? eoaAddress;
        const usdc = new Contract(USDC_ADDRESS, ERC20_ABI, provider);
        const usdcBalance: bigint = await usdc.balanceOf(balanceAddress);

        const result: Record<string, unknown> = {
          registered: reg !== null,
          eoaAddress,
          ethBalance: formatEther(ethBalance),
          ethBalanceWei: ethBalance.toString(),
          usdcAddress: balanceAddress,
          usdcBalance: formatUnits(usdcBalance, USDC_DECIMALS),
          usdcBalanceRaw: usdcBalance.toString(),
        };

        if (reg) {
          result.smartAccountAddress = reg.smartAccount;
          result.agentId = reg.agentId;
          result.poolAddress = reg.poolAddress;

          // Also fetch EOA USDC balance for comparison
          if (reg.smartAccount !== eoaAddress) {
            const eoaUsdcBalance: bigint = await usdc.balanceOf(eoaAddress);
            result.eoaUsdcBalance = formatUnits(eoaUsdcBalance, USDC_DECIMALS);
            result.eoaUsdcBalanceRaw = eoaUsdcBalance.toString();
          }
        }

        return JSON.stringify(result);
      }

      case "getPolicy": {
        const reg = walletData.registration;
        const accountAddr = input.smartAccountAddress ?? reg?.smartAccount;
        if (!accountAddr) {
          return JSON.stringify({
            error:
              "smartAccountAddress is required for getPolicy action. Register first with pragma-register, or provide the address of an AgentSmartAccount.",
          });
        }

        const provider = new JsonRpcProvider(rpcUrl);
        const account = new Contract(accountAddr, AGENT_SMART_ACCOUNT_ABI, provider);

        const [policy, dailySpend, owner, operator, agentId] = await Promise.all([
          account.getPolicy(),
          account.getDailySpend(),
          account.owner(),
          account.operator(),
          account.agentId(),
        ]);

        return JSON.stringify({
          smartAccountAddress: accountAddr,
          owner: owner as string,
          operator: operator as string,
          agentId: agentId as string,
          policy: {
            dailyLimit: formatUnits(policy.dailyLimit, USDC_DECIMALS),
            dailyLimitRaw: policy.dailyLimit.toString(),
            expiresAt: Number(policy.expiresAt),
            expiresAtDate: new Date(Number(policy.expiresAt) * 1000).toISOString(),
            requiresApprovalAbove: formatUnits(policy.requiresApprovalAbove, USDC_DECIMALS),
            requiresApprovalAboveRaw: policy.requiresApprovalAbove.toString(),
          },
          dailySpend: {
            amount: formatUnits(dailySpend.amount, USDC_DECIMALS),
            amountRaw: dailySpend.amount.toString(),
            lastReset: Number(dailySpend.lastReset),
            lastResetDate: new Date(Number(dailySpend.lastReset) * 1000).toISOString(),
          },
        });
      }

      default:
        return JSON.stringify({
          error: `Unknown action: ${input.action}. Valid actions: getBalance, getAddress, getPolicy`,
        });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

// ─── Tool schema ─────────────────────────────────────────────────────────────

export const walletSchema = {
  name: "pragma-wallet",
  description:
    "Manage the agent's PragmaMoney wallet on Base Sepolia. Get wallet address (EOA + smart account), check ETH/USDC balances, or read an AgentSmartAccount spending policy.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["getBalance", "getAddress", "getPolicy"],
        description: "The wallet action to perform.",
      },
      smartAccountAddress: {
        type: "string" as const,
        description:
          "Address of an AgentSmartAccount contract. Required for 'getPolicy' if not registered.",
      },
      rpcUrl: {
        type: "string" as const,
        description: "Override the default Base Sepolia RPC URL.",
      },
    },
    required: ["action"],
  },
};

export { getSignerWallet, loadOrCreateWallet, saveRegistration, getRegistration, requireRegistration };
export type { Registration, WalletData };
