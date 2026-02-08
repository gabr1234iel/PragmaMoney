/**
 * userop.ts — 4337 UserOperation client for AgentSmartAccount
 *
 * Wraps permissionless.js (Pimlico) + viem to build, sponsor, sign, and send
 * UserOperations through a pre-deployed AgentSmartAccount on Base Sepolia.
 *
 * EntryPoint v0.7 | Chain 84532 | Pimlico bundler + verifying paymaster
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { getUserOperationHash } from "viem/account-abstraction";
import { createPimlicoClient } from "permissionless/clients/pimlico";

import {
  ENTRYPOINT_ADDRESS,
  PIMLICO_BUNDLER_URL,
  RPC_URL,
  X402_GATEWAY_ADDRESS,
  SERVICE_REGISTRY_ADDRESS,
} from "./config.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Call {
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
}

export interface UserOpResult {
  txHash: string;
  userOpHash: string;
  success: boolean;
}

/** EntryPoint v0.7 UserOperation struct */
interface UserOperationV07 {
  sender: Address;
  nonce: bigint;
  factory: Address | undefined;
  factoryData: Hex | undefined;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster: Address | undefined;
  paymasterVerificationGasLimit: bigint | undefined;
  paymasterPostOpGasLimit: bigint | undefined;
  paymasterData: Hex | undefined;
  signature: Hex;
}

// ─── Viem-format ABIs (local to this file) ──────────────────────────────────

const ERC20_ABI_VIEM = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const FUSDC_ABI_VIEM = [
  {
    inputs: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "mint",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const GATEWAY_ABI_VIEM = [
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
] as const;

const UNIVERSAL_ROUTER_ABI_VIEM = [
  {
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

const SUPER_REAL_FAKE_USDC_ABI_VIEM = [
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "upgrade",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const REPUTATION_REPORTER_ABI_VIEM = [
  {
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    name: "giveFeedback",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
const PERMIT2_ABI_VIEM = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const POOL_ABI_VIEM = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "assets", type: "uint256" },
    ],
    name: "pull",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    name: "deposit",
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const SERVICE_REGISTRY_ABI_VIEM = [
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
] as const;

const SMART_ACCOUNT_ABI_VIEM = [
  {
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "dest", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "func", type: "bytes[]" },
    ],
    name: "executeBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ENTRYPOINT_ABI_VIEM = [
  {
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    name: "getNonce",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─── Hex helpers ────────────────────────────────────────────────────────────

function bigintToHex(n: bigint): Hex {
  return `0x${n.toString(16)}` as Hex;
}

function hexifyUserOp(
  op: UserOperationV07
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {
    sender: op.sender,
    nonce: bigintToHex(op.nonce),
    callData: op.callData,
    callGasLimit: bigintToHex(op.callGasLimit),
    verificationGasLimit: bigintToHex(op.verificationGasLimit),
    preVerificationGas: bigintToHex(op.preVerificationGas),
    maxFeePerGas: bigintToHex(op.maxFeePerGas),
    maxPriorityFeePerGas: bigintToHex(op.maxPriorityFeePerGas),
    signature: op.signature,
  };

  // v0.7: only include factory/paymaster fields when present
  if (op.factory) {
    result.factory = op.factory;
    result.factoryData = op.factoryData ?? "0x";
  }
  if (op.paymaster) {
    result.paymaster = op.paymaster;
    result.paymasterVerificationGasLimit = bigintToHex(op.paymasterVerificationGasLimit ?? 0n);
    result.paymasterPostOpGasLimit = bigintToHex(op.paymasterPostOpGasLimit ?? 0n);
    result.paymasterData = op.paymasterData ?? "0x";
  }

  return result;
}

// ─── Core: sendUserOp ───────────────────────────────────────────────────────

/**
 * Build, sponsor, sign, and submit a UserOperation for an AgentSmartAccount.
 *
 * @param smartAccountAddress - The deployed AgentSmartAccount address
 * @param operatorPrivateKey - Hex private key of the operator EOA (signs UserOps)
 * @param calls - One or more calls to execute through the smart account
 * @returns UserOpResult with txHash, userOpHash, and success flag
 */
export async function sendUserOp(
  smartAccountAddress: `0x${string}`,
  operatorPrivateKey: `0x${string}`,
  calls: Call[],
  options?: { skipSponsorship?: boolean }
): Promise<UserOpResult> {
  if (!PIMLICO_BUNDLER_URL) {
    throw new Error(
      "PIMLICO_API_KEY not set. Cannot send UserOperations without a bundler."
    );
  }

  if (calls.length === 0) {
    throw new Error("At least one call is required.");
  }

  // 1. Create viem account from operator private key
  const operatorAccount = privateKeyToAccount(operatorPrivateKey);

  // 2. Public client for on-chain reads (nonce from EntryPoint)
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

  // 3. Pimlico client for sponsorship + gas price + bundler submission
  const pimlicoClient = createPimlicoClient({
    chain: baseSepolia,
    transport: http(PIMLICO_BUNDLER_URL),
    entryPoint: {
      address: ENTRYPOINT_ADDRESS as Address,
      version: "0.7",
    },
  });

  // 4. Encode callData for the smart account
  let callData: Hex;
  if (calls.length === 1) {
    const c = calls[0];
    callData = encodeFunctionData({
      abi: SMART_ACCOUNT_ABI_VIEM,
      functionName: "execute",
      args: [c.to, c.value, c.data],
    });
  } else {
    const dests = calls.map((c) => c.to);
    const values = calls.map((c) => c.value);
    const datas = calls.map((c) => c.data);
    callData = encodeFunctionData({
      abi: SMART_ACCOUNT_ABI_VIEM,
      functionName: "executeBatch",
      args: [dests, values, datas],
    });
  }

  // 5. Get nonce from EntryPoint
  const nonce = await publicClient.readContract({
    address: ENTRYPOINT_ADDRESS as Address,
    abi: ENTRYPOINT_ABI_VIEM,
    functionName: "getNonce",
    args: [smartAccountAddress, 0n],
  });

  // 6. Get gas prices from Pimlico
  const gasPrice = await pimlicoClient.getUserOperationGasPrice();
  const { maxFeePerGas, maxPriorityFeePerGas } = gasPrice.fast;

  // 7. Build the unsigned UserOp (dummy signature for estimation)
  //    The smart account expects raw ECDSA signature (65 bytes)
  const dummySignature =
    "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c" as Hex;

  const unsignedUserOp: UserOperationV07 = {
    sender: smartAccountAddress,
    nonce: nonce as bigint,
    factory: undefined,
    factoryData: undefined,
    callData,
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymaster: undefined,
    paymasterVerificationGasLimit: undefined,
    paymasterPostOpGasLimit: undefined,
    paymasterData: undefined,
    signature: dummySignature,
  };

  let sponsoredUserOp: UserOperationV07;

  if (options?.skipSponsorship) {
    // 8a. Self-pay: estimate gas via bundler, no paymaster
    const gasEstimate = await bundlerRpc<{
      callGasLimit: string;
      verificationGasLimit: string;
      preVerificationGas: string;
    }>("eth_estimateUserOperationGas", [
      hexifyUserOp(unsignedUserOp),
      ENTRYPOINT_ADDRESS,
    ]);

    sponsoredUserOp = {
      ...unsignedUserOp,
      callGasLimit: BigInt(gasEstimate.callGasLimit) * 2n,
      verificationGasLimit: BigInt(gasEstimate.verificationGasLimit) * 2n,
      preVerificationGas: BigInt(gasEstimate.preVerificationGas) * 2n,
      paymaster: undefined,
      paymasterVerificationGasLimit: undefined,
      paymasterPostOpGasLimit: undefined,
      paymasterData: undefined,
    };
  } else {
    // 8b. Sponsored: get paymaster sponsorship + gas estimates from Pimlico
    const sponsorResult = await pimlicoClient.sponsorUserOperation({
      userOperation: {
        sender: unsignedUserOp.sender,
        nonce: unsignedUserOp.nonce,
        callData: unsignedUserOp.callData,
        callGasLimit: unsignedUserOp.callGasLimit,
        verificationGasLimit: unsignedUserOp.verificationGasLimit,
        preVerificationGas: unsignedUserOp.preVerificationGas,
        maxFeePerGas: unsignedUserOp.maxFeePerGas,
        maxPriorityFeePerGas: unsignedUserOp.maxPriorityFeePerGas,
        signature: unsignedUserOp.signature,
      },
    });

    sponsoredUserOp = {
      ...unsignedUserOp,
      callGasLimit: sponsorResult.callGasLimit,
      verificationGasLimit: sponsorResult.verificationGasLimit,
      preVerificationGas: sponsorResult.preVerificationGas,
      paymaster: sponsorResult.paymaster as Address | undefined,
      paymasterVerificationGasLimit: sponsorResult.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: sponsorResult.paymasterPostOpGasLimit,
      paymasterData: sponsorResult.paymasterData as Hex | undefined,
    };
  }

  // 10. Compute UserOp hash and sign it
  const userOpHash = getUserOperationHash({
    chainId: baseSepolia.id,
    entryPointAddress: ENTRYPOINT_ADDRESS as Address,
    entryPointVersion: "0.7",
    userOperation: {
      sender: sponsoredUserOp.sender,
      nonce: sponsoredUserOp.nonce,
      factory: sponsoredUserOp.factory,
      factoryData: sponsoredUserOp.factoryData,
      callData: sponsoredUserOp.callData,
      callGasLimit: sponsoredUserOp.callGasLimit,
      verificationGasLimit: sponsoredUserOp.verificationGasLimit,
      preVerificationGas: sponsoredUserOp.preVerificationGas,
      maxFeePerGas: sponsoredUserOp.maxFeePerGas,
      maxPriorityFeePerGas: sponsoredUserOp.maxPriorityFeePerGas,
      paymaster: sponsoredUserOp.paymaster,
      paymasterVerificationGasLimit: sponsoredUserOp.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: sponsoredUserOp.paymasterPostOpGasLimit,
      paymasterData: sponsoredUserOp.paymasterData,
      signature: sponsoredUserOp.signature,
    },
  });

  // Raw ECDSA signature — no ABI wrapping needed for v0.7 contract
  const rawSignature = await operatorAccount.signMessage({
    message: { raw: userOpHash as Hex },
  });
  sponsoredUserOp.signature = rawSignature;

  // 11. Submit via bundler (raw JSON-RPC)
  const sendResult = await bundlerRpc<string>("eth_sendUserOperation", [
    hexifyUserOp(sponsoredUserOp),
    ENTRYPOINT_ADDRESS,
  ]);

  // 12. Poll for receipt
  const receipt = await pollForReceipt(sendResult, 60_000);

  return {
    txHash: receipt.receipt.transactionHash,
    userOpHash: sendResult,
    success: receipt.success,
  };
}

// ─── Raw bundler JSON-RPC helper ────────────────────────────────────────────

/**
 * Send a raw JSON-RPC request to the Pimlico bundler endpoint.
 * This avoids fighting viem's strict EIP-1193 types for bundler-specific methods.
 */
async function bundlerRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(PIMLICO_BUNDLER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const json = (await res.json()) as {
    result?: T;
    error?: { code: number; message: string };
  };

  if (json.error) {
    throw new Error(`Bundler RPC error (${method}): ${json.error.message}`);
  }

  return json.result as T;
}

// ─── Receipt polling ────────────────────────────────────────────────────────

interface BundlerReceipt {
  success: boolean;
  receipt: {
    transactionHash: string;
    blockNumber: string;
  };
  reason?: string;
}

async function pollForReceipt(
  userOpHash: string,
  timeoutMs: number
): Promise<BundlerReceipt> {
  const start = Date.now();
  const interval = 2000; // poll every 2 seconds

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await bundlerRpc<BundlerReceipt | null>(
        "eth_getUserOperationReceipt",
        [userOpHash]
      );

      if (result) {
        return result;
      }
    } catch {
      // Receipt not available yet, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `Timed out waiting for UserOperation receipt after ${timeoutMs}ms. UserOpHash: ${userOpHash}`
  );
}

// ─── Call builders ──────────────────────────────────────────────────────────

/**
 * Build an ERC-20 approve call.
 */
export function buildApproveCall(
  token: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint
): Call {
  return {
    to: token,
    value: 0n,
    data: encodeFunctionData({
      abi: ERC20_ABI_VIEM,
      functionName: "approve",
      args: [spender, amount],
    }),
  };
}

/**
 * Build a mint call (for FUSDC or other mintable tokens).
 */
export function buildMintCall(
  token: `0x${string}`,
  to: `0x${string}`,
  amount: bigint
): Call {
  return {
    to: token,
    value: 0n,
    data: encodeFunctionData({
      abi: FUSDC_ABI_VIEM,
      functionName: "mint",
      args: [to, amount],
    }),
  };
}

/**
 * Build a Uniswap Universal Router execute call.
 */
export function buildUniversalRouterExecuteCall(
  router: `0x${string}`,
  commands: `0x${string}`,
  inputs: `0x${string}`[],
  deadline?: bigint
): Call {
  return {
    to: router,
    value: 0n,
    data: encodeFunctionData({
      abi: UNIVERSAL_ROUTER_ABI_VIEM,
      functionName: "execute",
      args: deadline !== undefined ? [commands, inputs, deadline] : [commands, inputs],
    }),
  };
}

/**
 * Build upgrade call for Super Real Fake USDC.
 */
export function buildUpgradeCall(
  token: `0x${string}`,
  amount: bigint
): Call {
  return {
    to: token,
    value: 0n,
    data: encodeFunctionData({
      abi: SUPER_REAL_FAKE_USDC_ABI_VIEM,
      functionName: "upgrade",
      args: [amount],
    }),
  };
}

/**
 * Build a Permit2 approve call (AllowanceTransfer.approve).
 */
export function buildPermit2ApproveCall(
  permit2: `0x${string}`,
  token: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint,
  expiration: bigint
): Call {
  return {
    to: permit2,
    value: 0n,
    data: encodeFunctionData({
      abi: PERMIT2_ABI_VIEM,
      functionName: "approve",
      args: [token, spender, amount, expiration] as any,
    }),
  };
}

/**
 * Build a gateway payForService call.
 * The smart account must have approved the gateway to spend USDC first.
 */
export function buildPayForServiceCall(
  serviceId: `0x${string}`,
  calls: bigint
): Call {
  return {
    to: X402_GATEWAY_ADDRESS as `0x${string}`,
    value: 0n,
    data: encodeFunctionData({
      abi: GATEWAY_ABI_VIEM,
      functionName: "payForService",
      args: [serviceId, calls],
    }),
  };
}

/**
 * Build a pool pull call (agent withdraws from its AgentPool).
 */
export function buildPoolPullCall(
  poolAddress: `0x${string}`,
  to: `0x${string}`,
  amount: bigint
): Call {
  return {
    to: poolAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: POOL_ABI_VIEM,
      functionName: "pull",
      args: [to, amount],
    }),
  };
}

/**
 * Build a ServiceRegistry.registerService call.
 */
export function buildRegisterServiceCall(
  serviceId: `0x${string}`,
  agentId: bigint,
  name: string,
  pricePerCall: bigint,
  endpoint: string,
  serviceType: number
): Call {
  return {
    to: SERVICE_REGISTRY_ADDRESS as `0x${string}`,
    value: 0n,
    data: encodeFunctionData({
      abi: SERVICE_REGISTRY_ABI_VIEM,
      functionName: "registerService",
      args: [serviceId, agentId, name, pricePerCall, endpoint, serviceType],
    }),
  };
}

/**
 * Build a pool deposit call (ERC-4626 deposit into an AgentPool).
 */
export function buildPoolDepositCall(
  poolAddress: `0x${string}`,
  assets: bigint,
  receiver: `0x${string}`
): Call {
  return {
    to: poolAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: POOL_ABI_VIEM,
      functionName: "deposit",
      args: [assets, receiver],
    }),
  };
}

/**
 * Build a ReputationReporter.giveFeedback call.
 */
export function buildReputationFeedbackCall(
  reporter: `0x${string}`,
  agentId: bigint,
  value: bigint,
  valueDecimals: number,
  tag1: string,
  tag2: string,
  endpoint: string,
  feedbackURI: string,
  feedbackHash: `0x${string}`
): Call {
  return {
    to: reporter,
    value: 0n,
    data: encodeFunctionData({
      abi: REPUTATION_REPORTER_ABI_VIEM,
      functionName: "giveFeedback",
      args: [
        agentId,
        value,
        valueDecimals,
        tag1,
        tag2,
        endpoint,
        feedbackURI,
        feedbackHash,
      ],
    }),
  };
}
