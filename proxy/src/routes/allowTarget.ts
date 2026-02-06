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

const AGENT_SMART_ACCOUNT_ABI = [
  "function setTargetAllowed(address target, bool allowed)",
];

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const allowTargetRouter = Router();

// ---------------------------------------------------------------------------
// POST /allow-target — Allow a new target on an agent's smart account
// ---------------------------------------------------------------------------

interface AllowTargetBody {
  operatorAddress?: string;
  agentId?: string;
  targetAddress?: string;
}

allowTargetRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as AllowTargetBody;
    const { operatorAddress, agentId, targetAddress } = body;

    // ---- Validation ----
    if (!operatorAddress || !ethers.isAddress(operatorAddress)) {
      res.status(400).json({ error: "operatorAddress is required and must be a valid Ethereum address" });
      return;
    }
    if (!agentId) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }
    if (!targetAddress || !ethers.isAddress(targetAddress)) {
      res.status(400).json({ error: "targetAddress is required and must be a valid Ethereum address" });
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
    let nftOwner: string | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        nftOwner = await identityRegistry.ownerOf(agentIdBigInt);
        break;
      } catch {
        if (attempt < 4) {
          const delayMs = 2000 * (attempt + 1);
          console.log(`[allow-target] ownerOf(${agentId}) not found yet, retrying in ${delayMs}ms (attempt ${attempt + 1}/5)...`);
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
        error: `NFT owner mismatch: expected ${operatorAddress}, got ${nftOwner}.`,
      });
      return;
    }

    // ---- Look up agent's smart account ----
    let smartAccountAddress: string | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const wallet = await identityRegistry.getAgentWallet(agentIdBigInt);
        if (wallet && wallet !== ethers.ZeroAddress) {
          smartAccountAddress = wallet;
          break;
        }
      } catch {
        // ignore
      }
      if (attempt < 4) {
        const delayMs = 2000 * (attempt + 1);
        console.log(`[allow-target] getAgentWallet(${agentId}) not found yet, retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    if (!smartAccountAddress) {
      res.status(400).json({ error: `No smart account (agentWallet) found for agentId ${agentId}` });
      return;
    }

    // ---- Call setTargetAllowed on the smart account ----
    await initDeployerNonce(provider, deployerAddress);
    const nonce = allocateNonce();

    console.log(`[allow-target] setTargetAllowed(${targetAddress}, true) on ${smartAccountAddress} (nonce=${nonce})`);
    const smartAccount = new Contract(
      smartAccountAddress,
      AGENT_SMART_ACCOUNT_ABI,
      deployer,
    );

    const tx = await smartAccount.setTargetAllowed(targetAddress, true, { nonce });
    const receipt = await tx.wait();

    console.log(`[allow-target] Done: target=${targetAddress}, smartAccount=${smartAccountAddress}, tx=${receipt.hash}`);

    res.json({
      success: true,
      smartAccountAddress,
      targetAddress,
      txHash: receipt.hash,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[allow-target] Error:", message);
    res.status(500).json({ error: "Allow target failed", details: message });
  }
});
