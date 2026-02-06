/**
 * userop.ts — 4337 UserOperation client for AgentSmartAccount
 *
 * Wraps permissionless.js (Pimlico) + viem to build, sponsor, sign, and send
 * UserOperations through a pre-deployed AgentSmartAccount on Base Sepolia.
 *
 * EntryPoint v0.6 | Chain 84532 | Pimlico bundler + verifying paymaster
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

/** EntryPoint v0.6 UserOperation struct */
interface UserOperationV06 {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
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
  op: UserOperationV06
): Record<string, string> {
  return {
    sender: op.sender,
    nonce: bigintToHex(op.nonce),
    initCode: op.initCode,
    callData: op.callData,
    callGasLimit: bigintToHex(op.callGasLimit),
    verificationGasLimit: bigintToHex(op.verificationGasLimit),
    preVerificationGas: bigintToHex(op.preVerificationGas),
    maxFeePerGas: bigintToHex(op.maxFeePerGas),
    maxPriorityFeePerGas: bigintToHex(op.maxPriorityFeePerGas),
    paymasterAndData: op.paymasterAndData,
    signature: op.signature,
  };
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
  calls: Call[]
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
      version: "0.6",
    },
  });

  // 5. Encode callData for the smart account
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

  // 6. Get nonce from EntryPoint
  const nonce = await publicClient.readContract({
    address: ENTRYPOINT_ADDRESS as Address,
    abi: ENTRYPOINT_ABI_VIEM,
    functionName: "getNonce",
    args: [smartAccountAddress, 0n],
  });

  // 7. Get gas prices from Pimlico
  const gasPrice = await pimlicoClient.getUserOperationGasPrice();
  const { maxFeePerGas, maxPriorityFeePerGas } = gasPrice.fast;

  // 8. Build the unsigned UserOp (dummy signature for estimation)
  const dummySignature =
    "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c" as Hex;

  const unsignedUserOp: UserOperationV06 = {
    sender: smartAccountAddress,
    nonce: nonce as bigint,
    initCode: "0x",
    callData,
    callGasLimit: 0n,
    verificationGasLimit: 0n,
    preVerificationGas: 0n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymasterAndData: "0x",
    signature: dummySignature,
  };

  // 9. Get paymaster sponsorship + gas estimates from Pimlico
  const sponsorResult = await pimlicoClient.sponsorUserOperation({
    userOperation: {
      sender: unsignedUserOp.sender,
      nonce: unsignedUserOp.nonce,
      initCode: unsignedUserOp.initCode,
      callData: unsignedUserOp.callData,
      callGasLimit: unsignedUserOp.callGasLimit,
      verificationGasLimit: unsignedUserOp.verificationGasLimit,
      preVerificationGas: unsignedUserOp.preVerificationGas,
      maxFeePerGas: unsignedUserOp.maxFeePerGas,
      maxPriorityFeePerGas: unsignedUserOp.maxPriorityFeePerGas,
      paymasterAndData: unsignedUserOp.paymasterAndData,
      signature: unsignedUserOp.signature,
    },
  });

  // 10. Merge sponsored values into the UserOp
  const sponsoredUserOp: UserOperationV06 = {
    ...unsignedUserOp,
    callGasLimit: sponsorResult.callGasLimit,
    verificationGasLimit: sponsorResult.verificationGasLimit,
    preVerificationGas: sponsorResult.preVerificationGas,
    paymasterAndData: sponsorResult.paymasterAndData,
  };

  // 11. Compute UserOp hash and sign it
  const userOpHash = getUserOperationHash({
    chainId: baseSepolia.id,
    entryPointAddress: ENTRYPOINT_ADDRESS as Address,
    entryPointVersion: "0.6",
    userOperation: {
      sender: sponsoredUserOp.sender,
      nonce: sponsoredUserOp.nonce,
      initCode: sponsoredUserOp.initCode as Hex | undefined,
      callData: sponsoredUserOp.callData,
      callGasLimit: sponsoredUserOp.callGasLimit,
      verificationGasLimit: sponsoredUserOp.verificationGasLimit,
      preVerificationGas: sponsoredUserOp.preVerificationGas,
      maxFeePerGas: sponsoredUserOp.maxFeePerGas,
      maxPriorityFeePerGas: sponsoredUserOp.maxPriorityFeePerGas,
      paymasterAndData: sponsoredUserOp.paymasterAndData as Hex | undefined,
      signature: sponsoredUserOp.signature,
    },
  });

  const signature = await operatorAccount.signMessage({
    message: { raw: userOpHash as Hex },
  });

  sponsoredUserOp.signature = signature;

  // 12. Submit via bundler (raw JSON-RPC)
  //     We use a raw fetch to the Pimlico RPC to avoid fighting viem's strict
  //     RPC type system for bundler-specific methods.
  const sendResult = await bundlerRpc<string>("eth_sendUserOperation", [
    hexifyUserOp(sponsoredUserOp),
    ENTRYPOINT_ADDRESS,
  ]);

  // 13. Poll for receipt
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
