import { Wallet, JsonRpcProvider, Contract, ethers } from "ethers";
import {
  IDENTITY_REGISTRY_ADDRESS,
  IDENTITY_REGISTRY_ABI,
  RELAYER_URL,
  CHAIN_ID,
  RPC_URL,
} from "./config.js";
import {
  loadOrCreateWallet,
  saveRegistration,
  getRegistration,
} from "./wallet.js";

// ─── Input type ──────────────────────────────────────────────────────────────

export interface RegisterInput {
  action: "register";
  name: string;
  description?: string;
  endpoint: string;
  dailyLimit: string;       // USDC, e.g. "100"
  expiryDays: number;       // e.g. 90
  poolDailyCap: string;     // USDC, e.g. "50"
  poolVestingDays?: number; // default 30
  relayerUrl?: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handleRegister(input: RegisterInput): Promise<string> {
  try {
    if (input.action !== "register") {
      return JSON.stringify({ error: `Unknown action: ${input.action}. Must be 'register'.` });
    }

    // 1. Check if already registered
    const existing = getRegistration();
    if (existing) {
      return JSON.stringify({
        error: "Agent is already registered.",
        agentId: existing.agentId,
        smartAccount: existing.smartAccount,
        poolAddress: existing.poolAddress,
      });
    }

    // 2. Load wallet to get EOA address + private key
    const walletData = loadOrCreateWallet();
    const relayerUrl = input.relayerUrl ?? RELAYER_URL;

    // ─── Phase 1: POST /register-agent/fund ────────────────────────────────
    // Proxy sends ETH to our EOA so we can call register() + setAgentWallet()

    const fundBody = {
      operatorAddress: walletData.address,
      name: input.name,
      description: input.description ?? "",
      endpoint: input.endpoint,
      dailyLimit: input.dailyLimit,
      expiryDays: input.expiryDays,
      poolDailyCap: input.poolDailyCap,
      poolVestingDays: input.poolVestingDays ?? 30,
    };

    console.log(`[pragma-register] Phase 1: Requesting ETH funding at ${relayerUrl}/register-agent/fund...`);
    const fundRes = await fetch(`${relayerUrl}/register-agent/fund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fundBody),
    });

    if (!fundRes.ok) {
      const err = await fundRes.json() as { error?: string; details?: string };
      return JSON.stringify({
        error: `Fund phase failed: ${err.error ?? fundRes.statusText}`,
        details: err.details,
      });
    }

    const fundData = await fundRes.json() as {
      fundTxHash: string;
      amount: string;
      operatorAddress: string;
      metadataURI: string;
    };

    console.log(`[pragma-register] Phase 1 complete: funded ${fundData.amount} ETH, tx=${fundData.fundTxHash}`);

    // ─── Agent calls register() on-chain ───────────────────────────────────
    // Agent EOA now owns the NFT (msg.sender = agent EOA)

    const provider = new JsonRpcProvider(RPC_URL);
    const agentSigner = new Wallet(walletData.privateKey, provider);
    const identityRegistry = new Contract(
      IDENTITY_REGISTRY_ADDRESS,
      IDENTITY_REGISTRY_ABI,
      agentSigner,
    );

    console.log(`[pragma-register] Calling IdentityRegistry.register() on-chain...`);
    const registerTx = await identityRegistry.register(fundData.metadataURI);
    const registerReceipt = await registerTx.wait();

    // Extract agentId from Transfer event (ERC-721 mint: from=0x0, to=agent, tokenId)
    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    const transferLog = registerReceipt.logs.find(
      (l: { topics: readonly string[] }) => l.topics[0] === transferTopic,
    );
    if (!transferLog) {
      return JSON.stringify({ error: "Failed to extract agentId from Transfer event" });
    }
    const agentId = BigInt(transferLog.topics[3]).toString();

    console.log(`[pragma-register] Registered on-chain: agentId=${agentId}, owner=${walletData.address}`);

    // Brief pause to let RPC nodes sync the register() state
    console.log(`[pragma-register] Waiting 3s for RPC state propagation...`);
    await new Promise((r) => setTimeout(r, 3000));

    // ─── Phase 2: POST /register-agent/setup ───────────────────────────────
    // Proxy deploys smart account + configures targets (NO pool yet)

    const setupBody = {
      operatorAddress: walletData.address,
      agentId,
    };

    console.log(`[pragma-register] Phase 2: Requesting smart account setup...`);
    const setupRes = await fetch(`${relayerUrl}/register-agent/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setupBody),
    });

    if (!setupRes.ok) {
      const err = await setupRes.json() as { error?: string; details?: string };
      return JSON.stringify({
        error: `Setup phase failed: ${err.error ?? setupRes.statusText}`,
        details: err.details,
      });
    }

    const setupData = await setupRes.json() as {
      agentId: string;
      smartAccountAddress: string;
      deadline: number;
      deployerAddress: string;
      txHashes: Record<string, string>;
    };

    console.log(
      `[pragma-register] Phase 2 complete: smartAccount=${setupData.smartAccountAddress}`,
    );

    // ─── Agent calls setAgentWallet() on-chain ─────────────────────────────
    // Binds smart account as agentWallet (required before pool creation)

    const domain = {
      name: "ERC8004IdentityRegistry",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: IDENTITY_REGISTRY_ADDRESS,
    };

    const types = {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const message = {
      agentId: BigInt(agentId),
      newWallet: setupData.smartAccountAddress,
      owner: walletData.address,  // Agent EOA owns the NFT
      deadline: BigInt(setupData.deadline),
    };

    console.log(`[pragma-register] Signing EIP-712 wallet binding...`);
    const signature = await agentSigner.signTypedData(domain, types, message);

    console.log(`[pragma-register] Calling IdentityRegistry.setAgentWallet() on-chain...`);
    const setWalletTx = await identityRegistry.setAgentWallet(
      BigInt(agentId),
      setupData.smartAccountAddress,
      setupData.deadline,
      signature,
    );
    const setWalletReceipt = await setWalletTx.wait();

    console.log(`[pragma-register] setAgentWallet tx=${setWalletReceipt.hash}`);

    // Brief pause to let RPC nodes sync the setAgentWallet() state
    console.log(`[pragma-register] Waiting 3s for RPC state propagation...`);
    await new Promise((r) => setTimeout(r, 3000));

    // ─── Phase 3: POST /register-agent/finalize ────────────────────────────
    // Proxy creates pool + allows pool as target (agentWallet is now set)

    const finalizeBody = {
      operatorAddress: walletData.address,
      agentId,
    };

    console.log(`[pragma-register] Phase 3: Requesting pool creation...`);
    const finalizeRes = await fetch(`${relayerUrl}/register-agent/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalizeBody),
    });

    if (!finalizeRes.ok) {
      const err = await finalizeRes.json() as { error?: string; details?: string };
      return JSON.stringify({
        error: `Finalize phase failed: ${err.error ?? finalizeRes.statusText}`,
        details: err.details,
      });
    }

    const finalizeData = await finalizeRes.json() as {
      agentId: string;
      smartAccountAddress: string;
      poolAddress: string;
      txHashes: Record<string, string>;
    };

    console.log(
      `[pragma-register] Phase 3 complete: pool=${finalizeData.poolAddress}`,
    );

    // ─── Save registration ─────────────────────────────────────────────────

    const allTxHashes = {
      ...setupData.txHashes,
      ...finalizeData.txHashes,
      register: registerReceipt.hash,
      setAgentWallet: setWalletReceipt.hash,
      fund: fundData.fundTxHash,
    };

    saveRegistration({
      agentId,
      smartAccount: setupData.smartAccountAddress,
      poolAddress: finalizeData.poolAddress,
      owner: walletData.address,
      registeredAt: new Date().toISOString(),
      txHashes: allTxHashes,
    });

    console.log(`[pragma-register] Registration complete!`);

    return JSON.stringify({
      success: true,
      agentId,
      smartAccountAddress: setupData.smartAccountAddress,
      poolAddress: finalizeData.poolAddress,
      operatorAddress: walletData.address,
      owner: walletData.address,
      txHashes: allTxHashes,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

// ─── Tool schema ─────────────────────────────────────────────────────────────

export const registerSchema = {
  name: "pragma-register",
  description:
    "Register the agent on PragmaMoney. Creates on-chain identity (NFT owned by agent), deploys a policy-enforced smart wallet (ERC-4337), binds it, and creates an investor funding pool. Must be called before using pragma-pay, pragma-pool, or pragma-call.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["register"],
        description: "Must be 'register'.",
      },
      name: {
        type: "string" as const,
        description: "Agent name. Required.",
      },
      description: {
        type: "string" as const,
        description: "Agent description. Optional.",
      },
      endpoint: {
        type: "string" as const,
        description: "Service endpoint URL. Required.",
      },
      dailyLimit: {
        type: "string" as const,
        description: "Smart wallet daily USDC spending limit (e.g. '100'). Required.",
      },
      expiryDays: {
        type: "number" as const,
        description: "Policy expiry in days from now (e.g. 90). Required.",
      },
      poolDailyCap: {
        type: "string" as const,
        description: "Pool daily pull cap in USDC (e.g. '50'). Required.",
      },
      poolVestingDays: {
        type: "number" as const,
        description: "Investor lock period in days. Defaults to 30.",
      },
      relayerUrl: {
        type: "string" as const,
        description: "Relayer URL override. Defaults to proxy URL.",
      },
    },
    required: ["action", "name", "endpoint", "dailyLimit", "expiryDays", "poolDailyCap"],
  },
};
