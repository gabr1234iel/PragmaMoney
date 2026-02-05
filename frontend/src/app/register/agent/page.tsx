"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSignTypedData, usePublicClient } from "wagmi";
import { pad, toHex, parseAbi, decodeEventLog, type Address } from "viem";
import {
  IDENTITY_REGISTRY_ADDRESS,
  IDENTITY_REGISTRY_ABI,
  AGENT_FACTORY_ADDRESS,
  AGENT_ACCOUNT_FACTORY_ABI,
  AGENT_POOL_FACTORY_ADDRESS,
  AGENT_POOL_FACTORY_ABI,
  USDC_ADDRESS
} from "@/lib/contracts";
import { parseUSDC, formatAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  AlertCircle,
  Wallet,
  Bot,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Shield,
  Clock,
  Loader2
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5;

interface AgentDetails {
  name: string;
  description: string;
  endpoint: string;
  x402Support: boolean;
}

interface WalletPolicy {
  dailyLimit: string;
  expiryDate: string;
  operator: string;
}

type TxStatus = "idle" | "pending" | "success" | "error";

interface TxState {
  status: TxStatus;
  hash?: `0x${string}`;
  error?: string;
  result?: string;
}

export default function RegisterAgentPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Step management
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Form data
  const [agentDetails, setAgentDetails] = useState<AgentDetails>({
    name: "",
    description: "",
    endpoint: "",
    x402Support: true,
  });

  const [walletPolicy, setWalletPolicy] = useState<WalletPolicy>({
    dailyLimit: "",
    expiryDate: "",
    operator: address || "",
  });

  // Transaction states
  const [registerTx, setRegisterTx] = useState<TxState>({ status: "idle" });
  const [deployTx, setDeployTx] = useState<TxState>({ status: "idle" });
  const [bindTx, setBindTx] = useState<TxState>({ status: "idle" });
  const [poolTx, setPoolTx] = useState<TxState>({ status: "idle" });

  // Pool configuration
  const [poolConfig, setPoolConfig] = useState({
    poolName: "",
    poolSymbol: "",
    dailyCap: "",
    vestingDays: "",
    metadataURI: "",
  });

  // Results
  const [agentId, setAgentId] = useState<bigint | null>(null);
  const [smartWalletAddress, setSmartWalletAddress] = useState<Address | null>(null);

  // Contract hooks
  const { writeContractAsync: writeIdentityRegistry } = useWriteContract();
  const { writeContractAsync: writeFactory } = useWriteContract();
  const { writeContractAsync: writeBindWallet } = useWriteContract();
  const { writeContractAsync: writePoolFactory } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  // Update operator when wallet connects
  useEffect(() => {
    if (address && !walletPolicy.operator) {
      setWalletPolicy((prev) => ({ ...prev, operator: address }));
    }
  }, [address, walletPolicy.operator]);

  // Auto-populate pool config when agent details change
  useEffect(() => {
    if (agentDetails.name) {
      setPoolConfig(prev => ({
        ...prev,
        poolName: prev.poolName || `${agentDetails.name} Pool`,
        poolSymbol: prev.poolSymbol || `PMP-${agentId || "0"}`,
      }));
    }
  }, [agentDetails.name, agentId]);

  // Step 1: Validate agent details
  const validateStep1 = (): boolean => {
    if (!agentDetails.name.trim()) return false;
    if (!agentDetails.endpoint.trim()) return false;
    try {
      new URL(agentDetails.endpoint);
    } catch {
      return false;
    }
    return true;
  };

  // Step 2: Validate wallet policy
  const validateStep2 = (): boolean => {
    if (!walletPolicy.dailyLimit || parseFloat(walletPolicy.dailyLimit) <= 0) return false;
    if (!walletPolicy.expiryDate) return false;
    if (!walletPolicy.operator || !/^0x[a-fA-F0-9]{40}$/.test(walletPolicy.operator)) return false;
    return true;
  };

  // Transaction 1: Register Identity
  const handleRegisterIdentity = async () => {
    if (!address) return;

    setRegisterTx({ status: "pending" });

    try {
      const agentURI = JSON.stringify({
        type: "AIAgent",
        name: agentDetails.name,
        description: agentDetails.description,
        services: [
          {
            type: "APIService",
            serviceEndpoint: agentDetails.endpoint,
          },
        ],
        x402Support: agentDetails.x402Support,
      });

      const hash = await writeIdentityRegistry({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [agentURI],
      });

      setRegisterTx({ status: "pending", hash });

      // Wait for transaction receipt
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });

      // Extract agentId from Transfer event (ERC-721 mint)
      const transferEvent = receipt.logs.find((log) => {
        try {
          const decoded = decodeEventLog({
            abi: parseAbi(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"]),
            data: log.data,
            topics: log.topics,
          });
          return decoded.eventName === "Transfer";
        } catch {
          return false;
        }
      });

      if (!transferEvent) {
        throw new Error("Failed to extract agentId from transaction receipt");
      }

      const decoded = decodeEventLog({
        abi: parseAbi(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"]),
        data: transferEvent.data,
        topics: transferEvent.topics,
      });

      const tokenId = decoded.args.tokenId as bigint;
      setAgentId(tokenId);

      setRegisterTx({
        status: "success",
        hash,
        result: `Agent ID: ${tokenId.toString()}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setRegisterTx({ status: "error", error: message });
    }
  };

  // Transaction 2: Create Smart Wallet
  const handleCreateWallet = async () => {
    if (!address || !agentId) return;

    setDeployTx({ status: "pending" });

    try {
      const dailyLimit = parseUSDC(walletPolicy.dailyLimit);
      const expiresAt = BigInt(Math.floor(new Date(walletPolicy.expiryDate).getTime() / 1000));
      const salt = pad(toHex(agentId), { size: 32 });

      const hash = await writeFactory({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_ACCOUNT_FACTORY_ABI,
        functionName: "createAccount",
        args: [address, walletPolicy.operator as Address, salt, dailyLimit, expiresAt],
      });

      setDeployTx({ status: "pending", hash });

      // Wait for confirmation
      await publicClient!.waitForTransactionReceipt({ hash });

      // Read deployed address from factory
      const deployedAddress = await publicClient!.readContract({
        address: AGENT_FACTORY_ADDRESS,
        abi: AGENT_ACCOUNT_FACTORY_ABI,
        functionName: "getAddress",
        args: [address, salt],
      });

      setSmartWalletAddress(deployedAddress as Address);

      setDeployTx({
        status: "success",
        hash,
        result: `Wallet: ${formatAddress(deployedAddress as string)}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setDeployTx({ status: "error", error: message });
    }
  };

  // Transaction 3: Bind Wallet
  const handleBindWallet = async () => {
    if (!address || !agentId || !smartWalletAddress) return;

    setBindTx({ status: "pending" });

    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 270); // 4.5 minutes (contract max: 5 min)

      // Sign EIP-712 typed data
      const signature = await signTypedDataAsync({
        domain: {
          name: "ERC8004IdentityRegistry",
          version: "1",
          chainId: 84532,
          verifyingContract: IDENTITY_REGISTRY_ADDRESS,
        },
        types: {
          AgentWalletSet: [
            { name: "agentId", type: "uint256" },
            { name: "newWallet", type: "address" },
            { name: "owner", type: "address" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "AgentWalletSet",
        message: {
          agentId,
          newWallet: smartWalletAddress,
          owner: address,
          deadline,
        },
      });

      // Submit binding transaction
      const hash = await writeBindWallet({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setAgentWallet",
        args: [agentId, smartWalletAddress, deadline, signature],
      });

      setBindTx({ status: "pending", hash });

      // Wait for confirmation
      await publicClient!.waitForTransactionReceipt({ hash });

      setBindTx({
        status: "success",
        hash,
        result: "Wallet bound successfully",
      });

      // Auto-advance to pool creation
      setTimeout(() => setCurrentStep(4), 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setBindTx({ status: "error", error: message });
    }
  };

  // Transaction 4: Create Pool
  const handleCreatePool = async () => {
    if (!address || !agentId || !smartWalletAddress) return;
    try {
      setPoolTx({ status: "pending" });

      // Build agentURI JSON (same as identity registration)
      const agentURIJson = JSON.stringify({
        name: agentDetails.name,
        description: agentDetails.description,
        endpoint: agentDetails.endpoint,
        x402Support: agentDetails.x402Support,
      });

      const hash = await writePoolFactory({
        address: AGENT_POOL_FACTORY_ADDRESS,
        abi: AGENT_POOL_FACTORY_ABI,
        functionName: "createAgentPool",
        args: [
          agentId,
          smartWalletAddress,
          {
            agentURI: agentURIJson,
            asset: USDC_ADDRESS,
            name: poolConfig.poolName,
            symbol: poolConfig.poolSymbol,
            poolOwner: address,
            dailyCap: parseUSDC(poolConfig.dailyCap),
            vestingDuration: BigInt(Number(poolConfig.vestingDays) * 86400),
            metadataURI: poolConfig.metadataURI || "",
          },
        ],
      });

      setPoolTx({ status: "success", hash });
      setTimeout(() => setCurrentStep(5), 1000);
    } catch (err) {
      console.error("Pool creation failed:", err);
      setPoolTx({
        status: "error",
        error: err instanceof Error ? err.message : "Pool creation failed",
      });
    }
  };

  // Render transaction status
  const renderTxStatus = (tx: TxState, label: string, onRetry: () => void, canExecute: boolean) => {
    return (
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            {tx.status === "idle" && (
              <div className="w-10 h-10 rounded-full border-2 border-lobster-border flex items-center justify-center text-lobster-text">
                <Clock className="w-5 h-5" />
              </div>
            )}
            {tx.status === "pending" && (
              <div className="w-10 h-10 rounded-full bg-lobster-primary/10 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-lobster-primary animate-spin" />
              </div>
            )}
            {tx.status === "success" && (
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            )}
            {tx.status === "error" && (
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
            )}
            <div className="flex-1">
              <h3 className="font-display text-lg font-semibold text-lobster-dark">{label}</h3>
              {tx.status === "pending" && <p className="text-sm text-lobster-text">Confirming transaction...</p>}
              {tx.status === "success" && <p className="text-sm text-green-600">{tx.result}</p>}
              {tx.status === "error" && <p className="text-sm text-red-600">{tx.error}</p>}
            </div>
          </div>
        </div>

        {tx.hash && (
          <a
            href={`https://sepolia.basescan.org/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-lobster-primary hover:text-lobster-hover flex items-center space-x-1 mb-4"
          >
            <span>View on BaseScan</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}

        {tx.status === "idle" && (
          <button
            onClick={onRetry}
            disabled={!canExecute}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed w-full"
          >
            Execute Transaction
          </button>
        )}

        {tx.status === "error" && (
          <button onClick={onRetry} className="btn-primary w-full">
            Retry Transaction
          </button>
        )}
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card text-center py-16">
            <div className="w-24 h-24 bg-lobster-surface rounded-full flex items-center justify-center mx-auto mb-6">
              <Wallet className="w-12 h-12 text-lobster-text" />
            </div>
            <h2 className="font-display text-3xl font-bold text-lobster-dark mb-4">
              Connect Your Wallet
            </h2>
            <p className="text-lobster-text">
              You need to connect your wallet to register an AI agent.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="font-display text-5xl font-bold text-lobster-dark mb-4">
            Register AI Agent
          </h1>
          <p className="text-xl text-lobster-text max-w-2xl mx-auto">
            Deploy an AI agent with a constrained smart wallet, spending policies, and on-chain identity
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-12">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {[
              { num: 1, label: "Details" },
              { num: 2, label: "Policy" },
              { num: 3, label: "Deploy" },
              { num: 4, label: "Pool" },
              { num: 5, label: "Done" },
            ].map((step, idx) => (
              <div key={step.num} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center font-display font-bold transition-all duration-200 mb-2",
                      currentStep > step.num
                        ? "bg-lobster-primary text-white"
                        : currentStep === step.num
                        ? "border-2 border-lobster-primary text-lobster-primary"
                        : "border-2 border-lobster-border text-lobster-text"
                    )}
                  >
                    {currentStep > step.num ? <CheckCircle className="w-6 h-6" /> : step.num}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      currentStep >= step.num ? "text-lobster-primary" : "text-lobster-text"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < 4 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 -mt-8 transition-all duration-200",
                      currentStep > step.num ? "bg-lobster-primary" : "bg-lobster-border"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Agent Details */}
        {currentStep === 1 && (
          <div className="max-w-2xl mx-auto">
            <div className="card">
              <div className="flex items-center space-x-3 mb-6">
                <Bot className="w-8 h-8 text-lobster-primary" />
                <h2 className="font-display text-2xl font-semibold text-lobster-dark">
                  Agent Details
                </h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">
                    Agent Name <span className="text-lobster-primary">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={agentDetails.name}
                    onChange={(e) => setAgentDetails({ ...agentDetails, name: e.target.value })}
                    placeholder="e.g., GPT-4 Research Assistant"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={agentDetails.description}
                    onChange={(e) => setAgentDetails({ ...agentDetails, description: e.target.value })}
                    placeholder="Describe what your agent does..."
                    rows={4}
                    className="input-field resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">
                    Service Endpoint <span className="text-lobster-primary">*</span>
                  </label>
                  <input
                    type="url"
                    required
                    value={agentDetails.endpoint}
                    onChange={(e) => setAgentDetails({ ...agentDetails, endpoint: e.target.value })}
                    placeholder="https://api.example.com/agent"
                    className="input-field"
                  />
                  <p className="text-xs text-lobster-text mt-1">
                    The upstream API your agent will use for inference or data
                  </p>
                </div>

                <div>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agentDetails.x402Support}
                      onChange={(e) => setAgentDetails({ ...agentDetails, x402Support: e.target.checked })}
                      className="w-5 h-5 text-lobster-primary rounded focus:ring-2 focus:ring-lobster-primary"
                    />
                    <span className="text-sm font-medium text-lobster-dark">
                      Support x402 payments
                    </span>
                  </label>
                  <p className="text-xs text-lobster-text mt-1 ml-8">
                    Enable automatic payment handling for API calls
                  </p>
                </div>
              </div>

              <div className="flex justify-end mt-8">
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!validateStep1()}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <span>Next</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Wallet Policy */}
        {currentStep === 2 && (
          <div className="max-w-2xl mx-auto">
            <div className="card">
              <div className="flex items-center space-x-3 mb-6">
                <Shield className="w-8 h-8 text-lobster-primary" />
                <h2 className="font-display text-2xl font-semibold text-lobster-dark">
                  Wallet Policy
                </h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">
                    Daily Spending Limit (USDC) <span className="text-lobster-primary">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lobster-text font-semibold">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.000001"
                      min="0"
                      required
                      value={walletPolicy.dailyLimit}
                      onChange={(e) => setWalletPolicy({ ...walletPolicy, dailyLimit: e.target.value })}
                      placeholder="100.00"
                      className="input-field pl-8"
                    />
                  </div>
                  <p className="text-xs text-lobster-text mt-1">
                    Maximum USDC this agent can spend per day
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">
                    Policy Expiry <span className="text-lobster-primary">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={walletPolicy.expiryDate}
                    onChange={(e) => setWalletPolicy({ ...walletPolicy, expiryDate: e.target.value })}
                    className="input-field"
                  />
                  <p className="text-xs text-lobster-text mt-1">
                    When this spending policy expires (can be updated later)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">
                    Operator Address <span className="text-lobster-primary">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={walletPolicy.operator}
                    onChange={(e) => setWalletPolicy({ ...walletPolicy, operator: e.target.value })}
                    placeholder="0x..."
                    className="input-field font-mono text-sm"
                  />
                  <p className="text-xs text-lobster-text mt-1">
                    Address authorized to execute transactions (defaults to your wallet)
                  </p>
                </div>
              </div>

              <div className="flex justify-between mt-8">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back</span>
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={!validateStep2()}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <span>Next</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Deploy */}
        {currentStep === 3 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl font-semibold text-lobster-dark mb-2">
                Register & Deploy
              </h2>
              <p className="text-lobster-text">
                Complete these three transactions to register your agent
              </p>
            </div>

            {renderTxStatus(
              registerTx,
              "1. Register Identity",
              handleRegisterIdentity,
              true
            )}

            {renderTxStatus(
              deployTx,
              "2. Create Smart Wallet",
              handleCreateWallet,
              registerTx.status === "success"
            )}

            {renderTxStatus(
              bindTx,
              "3. Bind Wallet",
              handleBindWallet,
              deployTx.status === "success"
            )}

            <div className="flex justify-start">
              <button
                onClick={() => setCurrentStep(2)}
                className="btn-secondary flex items-center space-x-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Pool Configuration */}
        {currentStep === 4 && (
          <div className="max-w-2xl mx-auto">
            <div className="card">
              <div>
                <h2 className="font-display text-2xl font-semibold text-lobster-dark mb-2">Create Agent Pool</h2>
                <p className="text-lobster-text text-sm">
                  Deploy an ERC-4626 funding pool for your agent. Investors can deposit USDC and your agent can pull funds daily.
                </p>
              </div>

              <div className="space-y-6 mt-6">
                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">Pool Name</label>
                  <input
                    type="text"
                    value={poolConfig.poolName}
                    onChange={(e) => setPoolConfig({ ...poolConfig, poolName: e.target.value })}
                    className="input-field"
                    placeholder="My Agent Pool"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">Pool Symbol</label>
                  <input
                    type="text"
                    value={poolConfig.poolSymbol}
                    onChange={(e) => setPoolConfig({ ...poolConfig, poolSymbol: e.target.value })}
                    className="input-field"
                    placeholder="PMP-1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">Daily Cap (USDC)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lobster-text font-semibold">
                      $
                    </span>
                    <input
                      type="number"
                      value={poolConfig.dailyCap}
                      onChange={(e) => setPoolConfig({ ...poolConfig, dailyCap: e.target.value })}
                      className="input-field pl-8"
                      placeholder="100"
                      min="0"
                      step="0.000001"
                    />
                  </div>
                  <p className="text-xs text-lobster-text mt-1">Maximum USDC your agent can pull per day</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">Vesting Duration (days)</label>
                  <input
                    type="number"
                    value={poolConfig.vestingDays}
                    onChange={(e) => setPoolConfig({ ...poolConfig, vestingDays: e.target.value })}
                    className="input-field"
                    placeholder="30"
                    min="0"
                  />
                  <p className="text-xs text-lobster-text mt-1">Lock period for investor deposits</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-lobster-dark mb-2">Metadata URI (optional)</label>
                  <input
                    type="text"
                    value={poolConfig.metadataURI}
                    onChange={(e) => setPoolConfig({ ...poolConfig, metadataURI: e.target.value })}
                    className="input-field"
                    placeholder="ipfs://... or https://..."
                  />
                </div>
              </div>

              {/* Pool transaction status */}
              {poolTx.status !== "idle" && (
                <div className={`p-4 rounded-xl border mt-6 ${
                  poolTx.status === "success" ? "bg-green-50 border-green-200" :
                  poolTx.status === "error" ? "bg-red-50 border-red-200" :
                  "bg-yellow-50 border-yellow-200"
                }`}>
                  <p className="text-sm font-medium">
                    {poolTx.status === "pending" && "Creating pool..."}
                    {poolTx.status === "success" && "Pool created successfully!"}
                    {poolTx.status === "error" && (poolTx.error || "Pool creation failed")}
                  </p>
                  {poolTx.hash && (
                    <a
                      href={`https://sepolia.basescan.org/tx/${poolTx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-lobster-primary hover:text-lobster-hover flex items-center space-x-1 mt-1"
                    >
                      <span>View on BaseScan</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleCreatePool}
                  disabled={!poolConfig.poolName || !poolConfig.dailyCap || !poolConfig.vestingDays || poolTx.status === "pending"}
                  className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {poolTx.status === "pending" ? "Creating Pool..." : poolTx.status === "error" ? "Retry" : "Create Pool"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Summary */}
        {currentStep === 5 && (
          <div className="max-w-2xl mx-auto">
            <div className="card text-center py-12">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="font-display text-3xl font-bold text-lobster-dark mb-4">
                Agent Registered Successfully!
              </h2>
              <p className="text-lobster-text mb-8">
                Your AI agent is now deployed with a constrained smart wallet
              </p>

              <div className="space-y-6 text-left">
                <div className="bg-lobster-surface rounded-xl p-6">
                  <h3 className="font-display text-lg font-semibold text-lobster-dark mb-4">
                    Agent Details
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-lobster-text mb-1">Agent ID</p>
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-lobster-dark font-semibold">
                          #{agentId?.toString()}
                        </p>
                        <a
                          href={`https://sepolia.basescan.org/token/${IDENTITY_REGISTRY_ADDRESS}?a=${agentId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-lobster-primary hover:text-lobster-hover flex items-center space-x-1"
                        >
                          <span>View NFT</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-lobster-text mb-1">Smart Wallet Address</p>
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-lobster-dark font-semibold">
                          {smartWalletAddress && formatAddress(smartWalletAddress)}
                        </p>
                        <a
                          href={`https://sepolia.basescan.org/address/${smartWalletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-lobster-primary hover:text-lobster-hover flex items-center space-x-1"
                        >
                          <span>View</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-lobster-surface rounded-xl p-6">
                  <h3 className="font-display text-lg font-semibold text-lobster-dark mb-4">
                    Policy Details
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-lobster-text">Daily Limit</span>
                      <span className="text-sm font-semibold text-lobster-dark">
                        ${walletPolicy.dailyLimit} USDC
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-lobster-text">Expires</span>
                      <span className="text-sm font-semibold text-lobster-dark">
                        {new Date(walletPolicy.expiryDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-lobster-text">Operator</span>
                      <span className="text-sm font-mono font-semibold text-lobster-dark">
                        {formatAddress(walletPolicy.operator)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <a
                href="/dashboard"
                className="btn-primary inline-flex items-center space-x-2 mt-8"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
