import { Router, type Request, type Response } from "express";
import { JsonRpcProvider, Wallet, Contract, ethers } from "ethers";
import { config } from "../config.js";
import { initDeployerNonce, allocateNonce } from "../services/nonceManager.js";

// ---------------------------------------------------------------------------
// ABIs (human-readable)
// ---------------------------------------------------------------------------

const IDENTITY_REGISTRY_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
];

const AGENT_ACCOUNT_FACTORY_ABI = [
  "function createAccount(address owner, address operator, bytes32 agentId, uint256 dailyLimit, uint256 expiresAt) returns (address)",
  "function getAddress(address owner, bytes32 agentId) view returns (address)",
];

const AGENT_SMART_ACCOUNT_ABI = [
  "function setTargetAllowed(address target, bool allowed)",
  "function setTokenAllowed(address token, bool allowed)",
];

const AGENT_POOL_FACTORY_ABI = [
  "function createAgentPool(uint256 agentId, address agentWallet, tuple(string agentURI, address asset, string name, string symbol, address poolOwner, uint256 dailyCap, uint64 vestingDuration, string metadataURI) params) returns (address)",
];

// ---------------------------------------------------------------------------
// Pending registration storage (keyed by operatorAddress)
// ---------------------------------------------------------------------------

interface PendingRegistration {
  operatorAddress: string;
  name: string;
  description: string;
  dailyLimit: string;
  expiryDays: number;
  poolDailyCap: string;
  poolVestingDays: number;
  metadataURI: string;
  fundTxHash: string;
  smartAccountAddress: string;
  createdAt: number;
}

const pendingRegistrations = new Map<string, PendingRegistration>();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const registerAgentRouter = Router();

// ---------------------------------------------------------------------------
// Phase 1: POST /fund — Send ETH to agent EOA for on-chain register()
// ---------------------------------------------------------------------------

interface FundBody {
  operatorAddress?: string;
  name?: string;
  description?: string;
  dailyLimit?: string;
  expiryDays?: number;
  poolDailyCap?: string;
  poolVestingDays?: number;
}

registerAgentRouter.post("/fund", async (req: Request, res: Response) => {
  try {
    const body = req.body as FundBody;
    const {
      operatorAddress,
      name,
      description,
      dailyLimit,
      expiryDays,
      poolDailyCap,
      poolVestingDays,
    } = body;

    // ---- Validation ----
    if (!operatorAddress || !ethers.isAddress(operatorAddress)) {
      res
        .status(400)
        .json({ error: "operatorAddress is required and must be a valid Ethereum address" });
      return;
    }
    if (!name || name.trim().length === 0) {
      res.status(400).json({ error: "name is required and must be non-empty" });
      return;
    }
    if (!dailyLimit || Number(dailyLimit) <= 0) {
      res.status(400).json({ error: "dailyLimit is required and must be > 0" });
      return;
    }

    // ---- Set up deployer signer ----
    const provider = new JsonRpcProvider(config.gatewayRpcUrl);
    const deployer = new Wallet(config.proxySignerKey, provider);

    // ---- Build metadata URI ----
    const metadataURI = JSON.stringify({
      name: name.trim(),
      description: (description ?? "").trim(),
    });

    // ---- Send ETH to agent EOA ----
    const deployerAddress = await deployer.getAddress();
    await initDeployerNonce(provider, deployerAddress);

    const amount = ethers.parseEther(config.fundAmountEoa);
    const nonce = allocateNonce();
    console.log(`[register-agent/fund] Sending ${config.fundAmountEoa} ETH to ${operatorAddress}... (nonce=${nonce})`);

    const fundTx = await deployer.sendTransaction({ to: operatorAddress, value: amount, nonce });
    const fundReceipt = await fundTx.wait();

    // ---- Store pending registration ----
    const key = operatorAddress.toLowerCase();
    pendingRegistrations.set(key, {
      operatorAddress,
      name: name.trim(),
      description: (description ?? "").trim(),
      dailyLimit: dailyLimit,
      expiryDays: expiryDays ?? 365,
      poolDailyCap: poolDailyCap ?? "1000",
      poolVestingDays: poolVestingDays ?? 30,
      metadataURI,
      fundTxHash: fundReceipt!.hash,
      smartAccountAddress: "",
      createdAt: Date.now(),
    });

    console.log(
      `[register-agent/fund] Funded ${operatorAddress}, tx=${fundReceipt!.hash}`,
    );

    res.json({
      fundTxHash: fundReceipt!.hash,
      amount: config.fundAmountEoa,
      operatorAddress,
      metadataURI,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[register-agent/fund] Error:", message);
    res.status(500).json({ error: "Fund phase failed", details: message });
  }
});

// ---------------------------------------------------------------------------
// Phase 2: POST /setup — Deploy smart account + configure targets
// (NO pool creation — agentWallet must be set first)
// ---------------------------------------------------------------------------

interface SetupBody {
  operatorAddress?: string;
  agentId?: string;
}

registerAgentRouter.post("/setup", async (req: Request, res: Response) => {
  try {
    const body = req.body as SetupBody;
    const { operatorAddress, agentId } = body;

    // ---- Validation ----
    if (!operatorAddress || !ethers.isAddress(operatorAddress)) {
      res.status(400).json({ error: "operatorAddress is required and must be a valid Ethereum address" });
      return;
    }
    if (!agentId) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }

    // ---- Retrieve pending registration ----
    const key = operatorAddress.toLowerCase();
    const pending = pendingRegistrations.get(key);
    if (!pending) {
      res.status(404).json({ error: `No pending registration found for ${operatorAddress}. Call /fund first.` });
      return;
    }

    // ---- Set up deployer signer ----
    const provider = new JsonRpcProvider(config.gatewayRpcUrl);
    const deployer = new Wallet(config.proxySignerKey, provider);
    const deployerAddress = await deployer.getAddress();

    // ---- Verify NFT ownership on-chain ----
    const identityRegistry = new Contract(
      config.identityRegistryAddress,
      IDENTITY_REGISTRY_ABI,
      provider,
    );

    const agentIdBigInt = BigInt(agentId);

    // Retry ownerOf — public RPCs behind load balancers return stale state
    // right after the agent's register() tx confirms on a different node.
    let nftOwner: string | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        nftOwner = await identityRegistry.ownerOf(agentIdBigInt);
        break;
      } catch {
        if (attempt < 4) {
          const delayMs = 2000 * (attempt + 1);
          console.log(`[register-agent/setup] ownerOf(${agentId}) not found yet, retrying in ${delayMs}ms (attempt ${attempt + 1}/5)...`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    if (!nftOwner) {
      res.status(404).json({ error: `agentId ${agentId} does not exist on-chain (after 5 retries)` });
      return;
    }

    if (nftOwner.toLowerCase() !== operatorAddress.toLowerCase()) {
      res.status(403).json({
        error: `NFT owner mismatch: expected ${operatorAddress}, got ${nftOwner}. Agent EOA must call register() first.`,
      });
      return;
    }

    const agentIdBytes32 = ethers.zeroPadValue(ethers.toBeHex(agentIdBigInt), 32);
    const txHashes: Record<string, string> = {};

    await initDeployerNonce(provider, deployerAddress);

    // ---- Step 1: Deploy smart account ----
    const n1 = allocateNonce();
    console.log(`[register-agent/setup] Creating smart account for agentId=${agentId}... (nonce=${n1})`);
    const factory = new Contract(
      config.agentAccountFactoryAddress,
      AGENT_ACCOUNT_FACTORY_ABI,
      deployer,
    );

    const dailyLimitWei = ethers.parseUnits(pending.dailyLimit, 6);
    const expiresAtUnix = Math.floor(Date.now() / 1000) + pending.expiryDays * 86400;

    const createTx = await factory.createAccount(
      deployerAddress,
      operatorAddress,
      agentIdBytes32,
      dailyLimitWei,
      expiresAtUnix,
      { nonce: n1 },
    );
    const createReceipt = await createTx.wait();
    txHashes.createAccount = createReceipt.hash;

    // Compute smart account address
    const smartAccountAddress: string = await factory["getAddress(address,bytes32)"](deployerAddress, agentIdBytes32);
    console.log(`[register-agent/setup] Smart account: ${smartAccountAddress}, tx=${createReceipt.hash}`);

    // Wait for RPC state propagation (createAccount and setTargetAllowed in
    // the same block can race on load-balanced RPCs)
    console.log(`[register-agent/setup] Waiting 3s for RPC state propagation...`);
    await new Promise((r) => setTimeout(r, 3000));

    // ---- Step 2: Configure smart account targets ----
    const smartAccount = new Contract(
      smartAccountAddress,
      AGENT_SMART_ACCOUNT_ABI,
      deployer,
    );

    // Retry setTargetAllowed — stale RPC nodes may not yet see the clone
    let n2 = allocateNonce();
    console.log(`[register-agent/setup] Configuring targets... (nonce=${n2})`);
    let allowGatewayTx;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        allowGatewayTx = await smartAccount.setTargetAllowed(config.gatewayAddress, true, { nonce: n2 });
        const gwReceipt = await allowGatewayTx.wait();
        if (gwReceipt.status === 1) break;
        throw new Error("setTargetAllowed reverted");
      } catch (err) {
        if (attempt < 2) {
          console.log(`[register-agent/setup] setTargetAllowed attempt ${attempt + 1} failed, retrying in 3s...`);
          await new Promise((r) => setTimeout(r, 3000));
          n2 = allocateNonce();
        } else {
          throw err;
        }
      }
    }

    const n3 = allocateNonce();
    const allowUsdcTargetTx = await smartAccount.setTargetAllowed(config.usdcAddress, true, { nonce: n3 });
    await allowUsdcTargetTx.wait();

    const n4 = allocateNonce();
    const allowUsdcTokenTx = await smartAccount.setTokenAllowed(config.usdcAddress, true, { nonce: n4 });
    await allowUsdcTokenTx.wait();

    const n5 = allocateNonce();
    const allowRegistryTx = await smartAccount.setTargetAllowed(config.serviceRegistryAddress, true, { nonce: n5 });
    const allowRegistryReceipt = await allowRegistryTx.wait();
    txHashes.setTargets = allowRegistryReceipt.hash;
    console.log(`[register-agent/setup] setTargets done (gateway, USDC, ServiceRegistry)`);

    const n6 = allocateNonce();
    const allowUniversalRouterTx = await smartAccount.setTargetAllowed(
      config.uniswapUniversalRouterAddress,
      true,
      { nonce: n6 },
    );
    await allowUniversalRouterTx.wait();

    const n7 = allocateNonce();
    const allowTokenInTx = await smartAccount.setTokenAllowed(
      config.superRealFakeUsdcAddress,
      true,
      { nonce: n7 },
    );
    await allowTokenInTx.wait();

    const n8 = allocateNonce();
    const allowTokenOutTx = await smartAccount.setTokenAllowed(
      config.bingerTokenAddress,
      true,
      { nonce: n8 },
    );
    await allowTokenOutTx.wait();
    console.log(
      `[register-agent/setup] allowed Uniswap router + tokens (in/out)`,
    );

    const n9 = allocateNonce();
    const allowFusdcTargetTx = await smartAccount.setTargetAllowed(
      config.rfusdcAddress,
      true,
      { nonce: n9 },
    );
    await allowFusdcTargetTx.wait();

    const n10 = allocateNonce();
    const allowFusdcTokenTx = await smartAccount.setTokenAllowed(
      config.rfusdcAddress,
      true,
      { nonce: n10 },
    );
    await allowFusdcTokenTx.wait();
    console.log(`[register-agent/setup] allowed FUSDC target + token`);

    // Store smart account address for /finalize phase
    pending.smartAccountAddress = smartAccountAddress;

    const deadline = Math.floor(Date.now() / 1000) + 270;

    console.log(
      `[register-agent/setup] Setup complete for agentId=${agentId}, smartAccount=${smartAccountAddress}`,
    );

    res.json({
      agentId,
      smartAccountAddress,
      deadline,
      deployerAddress,
      txHashes,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[register-agent/setup] Error:", message);
    res.status(500).json({ error: "Setup phase failed", details: message });
  }
});

// ---------------------------------------------------------------------------
// Phase 3: POST /finalize — Create pool (after agent called setAgentWallet)
// AgentFactory.createAgentPool requires getAgentWallet(agentId) == smartAccount
// ---------------------------------------------------------------------------

interface FinalizeBody {
  operatorAddress?: string;
  agentId?: string;
}

registerAgentRouter.post("/finalize", async (req: Request, res: Response) => {
  try {
    const body = req.body as FinalizeBody;
    const { operatorAddress, agentId } = body;

    // ---- Validation ----
    if (!operatorAddress || !ethers.isAddress(operatorAddress)) {
      res.status(400).json({ error: "operatorAddress is required and must be a valid Ethereum address" });
      return;
    }
    if (!agentId) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }

    // ---- Retrieve pending registration ----
    const key = operatorAddress.toLowerCase();
    const pending = pendingRegistrations.get(key);
    if (!pending) {
      res.status(404).json({ error: `No pending registration found for ${operatorAddress}. Call /fund and /setup first.` });
      return;
    }
    if (!pending.smartAccountAddress) {
      res.status(400).json({ error: "Smart account not deployed yet. Call /setup first." });
      return;
    }

    const smartAccountAddress = pending.smartAccountAddress;

    // ---- Set up deployer signer ----
    const provider = new JsonRpcProvider(config.gatewayRpcUrl);
    const deployer = new Wallet(config.proxySignerKey, provider);
    const deployerAddress = await deployer.getAddress();

    // ---- Verify agentWallet is set to smart account ----
    const identityRegistry = new Contract(
      config.identityRegistryAddress,
      IDENTITY_REGISTRY_ABI,
      provider,
    );

    const agentIdBigInt = BigInt(agentId);

    // Retry getAgentWallet — stale RPC after agent's setAgentWallet() tx
    let agentWallet: string | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        agentWallet = await identityRegistry.getAgentWallet(agentIdBigInt);
        if (agentWallet && agentWallet.toLowerCase() === smartAccountAddress.toLowerCase()) {
          break;
        }
        // Wallet exists but doesn't match yet — RPC stale
        agentWallet = undefined;
      } catch {
        // ignore
      }
      if (attempt < 4) {
        const delayMs = 2000 * (attempt + 1);
        console.log(`[register-agent/finalize] agentWallet not set yet, retrying in ${delayMs}ms (attempt ${attempt + 1}/5)...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    if (!agentWallet) {
      res.status(400).json({
        error: `agentWallet for agentId ${agentId} is not set to ${smartAccountAddress}. Agent must call setAgentWallet() first.`,
      });
      return;
    }

    const txHashes: Record<string, string> = {};

    await initDeployerNonce(provider, deployerAddress);

    // ---- Step 1: Create agent pool ----
    const n1 = allocateNonce();
    console.log(`[register-agent/finalize] Creating agent pool for agentId=${agentId}... (nonce=${n1})`);
    const agentPoolFactory = new Contract(
      config.agentPoolFactoryAddress,
      AGENT_POOL_FACTORY_ABI,
      deployer,
    );

    const poolParams = {
      agentURI: pending.metadataURI,
      asset: config.usdcAddress,
      name: `${pending.name} Pool`,
      symbol: `af${pending.name.replace(/\s+/g, "").slice(0, 8)}`,
      poolOwner: deployerAddress,
      dailyCap: ethers.parseUnits(pending.poolDailyCap, 6),
      vestingDuration: BigInt(pending.poolVestingDays * 86400),
      metadataURI: pending.metadataURI,
    };

    const createPoolTx = await agentPoolFactory.createAgentPool(
      agentIdBigInt,
      smartAccountAddress,
      poolParams,
      { nonce: n1 },
    );
    const poolReceipt = await createPoolTx.wait();
    txHashes.createPool = poolReceipt.hash;

    // Extract pool address from AgentPoolCreated event
    const agentPoolCreatedTopic = ethers.id("AgentPoolCreated(address,uint256,address)");
    const poolLog = poolReceipt.logs.find(
      (l: { topics: readonly string[] }) => l.topics[0] === agentPoolCreatedTopic,
    );

    let poolAddress = "";
    if (poolLog && "data" in poolLog) {
      const data = (poolLog as { data: string }).data;
      poolAddress = ethers.getAddress("0x" + data.slice(26, 66));
    }

    // ---- Step 2: Allow pool as target on smart account ----
    if (poolAddress) {
      const n2 = allocateNonce();
      console.log(`[register-agent/finalize] Allowing pool ${poolAddress} as target... (nonce=${n2})`);
      const smartAccount = new Contract(
        smartAccountAddress,
        AGENT_SMART_ACCOUNT_ABI,
        deployer,
      );
      const allowPoolTx = await smartAccount.setTargetAllowed(poolAddress, true, { nonce: n2 });
      await allowPoolTx.wait();
    }

    // ---- Step 3: Fund smart account with ETH for self-pay UserOps ----
    const fundAmount = ethers.parseEther(config.fundAmountEoa);
    const n3 = allocateNonce();
    console.log(`[register-agent/finalize] Funding smart account ${smartAccountAddress} with ${config.fundAmountEoa} ETH... (nonce=${n3})`);
    const fundSmartAccTx = await deployer.sendTransaction({ to: smartAccountAddress, value: fundAmount, nonce: n3 });
    const fundSmartAccReceipt = await fundSmartAccTx.wait();
    txHashes.fundSmartAccount = fundSmartAccReceipt!.hash;

    // ---- Cleanup ----
    pendingRegistrations.delete(key);

    console.log(
      `[register-agent/finalize] Done: agentId=${agentId}, pool=${poolAddress}`,
    );

    res.json({
      agentId,
      smartAccountAddress,
      poolAddress,
      txHashes,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[register-agent/finalize] Error:", message);
    res.status(500).json({ error: "Finalize phase failed", details: message });
  }
});
