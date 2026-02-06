import { Router, type Request, type Response } from "express";
import { JsonRpcProvider, Wallet, Contract, ethers } from "ethers";
import { config } from "../config.js";
import { initDeployerNonce, allocateNonce } from "../services/nonceManager.js";

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

const IDENTITY_REGISTRY_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
];

// ---------------------------------------------------------------------------
// Anti-replay: track which agentIds have been funded
// ---------------------------------------------------------------------------

const fundedAgents = new Set<string>();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const fundAgentRouter = Router();

// ---------------------------------------------------------------------------
// POST / — Send ETH to an agent EOA (standalone faucet)
// ---------------------------------------------------------------------------

interface FundBody {
  agentId?: string;
  address?: string;
}

fundAgentRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as FundBody;
    const { agentId, address } = body;

    // ---- Validation ----
    if (!agentId || agentId.trim().length === 0) {
      res.status(400).json({ error: "agentId is required" });
      return;
    }
    if (!address || !ethers.isAddress(address)) {
      res.status(400).json({ error: "address is required and must be a valid Ethereum address" });
      return;
    }

    // ---- Check already funded ----
    if (fundedAgents.has(agentId)) {
      res.status(409).json({ error: `agentId ${agentId} has already been funded` });
      return;
    }

    // ---- Set up deployer signer ----
    const provider = new JsonRpcProvider(config.gatewayRpcUrl);
    const deployer = new Wallet(config.proxySignerKey, provider);

    // ---- Verify agentId on-chain ----
    const identityRegistry = new Contract(
      config.identityRegistryAddress,
      IDENTITY_REGISTRY_ABI,
      provider,
    );

    try {
      await identityRegistry.ownerOf(BigInt(agentId));
    } catch {
      res.status(404).json({ error: `agentId ${agentId} does not exist on-chain` });
      return;
    }

    // ---- Check deployer balance ----
    const deployerBalance = await provider.getBalance(await deployer.getAddress());
    if (deployerBalance < ethers.parseEther("0.01")) {
      res.status(503).json({ error: "Faucet deployer balance too low" });
      return;
    }

    // ---- Send ETH ----
    await initDeployerNonce(provider, await deployer.getAddress());

    const amount = ethers.parseEther(config.fundAmountEoa);
    const nonce = allocateNonce();
    console.log(`[fund-agent] Sending ${config.fundAmountEoa} ETH to ${address} for agentId=${agentId}... (nonce=${nonce})`);

    const tx = await deployer.sendTransaction({ to: address, value: amount, nonce });
    const receipt = await tx.wait();

    fundedAgents.add(agentId);

    console.log(`[fund-agent] Funded agentId=${agentId}, tx=${receipt!.hash}`);

    res.json({
      success: true,
      txHash: receipt!.hash,
      recipient: address,
      amount: config.fundAmountEoa,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[fund-agent] Error:", message);
    res.status(500).json({ error: "Funding failed", details: message });
  }
});
