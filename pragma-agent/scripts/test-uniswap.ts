import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  hexToBytes,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { RoutePlanner, CommandType } = require("@uniswap/universal-router-sdk");
const { Actions, URVersion, V4Planner } = require("@uniswap/v4-sdk");

function normalizeHex(value: string): Hex {
  const hex = (value.startsWith("0x") ? value : `0x${value}`) as Hex;
  return bytesToHex(hexToBytes(hex));
}

import {
  RPC_URL,
  RFUSDC_ADDRESS,
  SUPER_FAKE_USDC_ADDRESS,
  BINGER_TOKEN_ADDRESS,
  PERMIT2_ADDRESS,
  UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
} from "../src/config.js";

const RFUSDC_AMOUNT = 1_000_000n; // 1 RFUSDC (6 decimals)
const SUPER_USDC_AMOUNT = RFUSDC_AMOUNT * 1_000_000_000_000n; // scale to 18 decimals
const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT48 = (1n << 48n) - 1n;
const TOKEN_IN_ADDRESS = SUPER_FAKE_USDC_ADDRESS as Address;
const TOKEN_OUT_ADDRESS = BINGER_TOKEN_ADDRESS as Address;

const ERC20_APPROVE_ABI = [
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

const RFUSDC_MINT_ABI = [
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

const SUPER_FAKE_USDC_UPGRADE_ABI = [
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "upgrade",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ERC20_ALLOWANCE_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const PERMIT2_ABI = [
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
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const UNIVERSAL_ROUTER_ABI = [
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return value;
}

async function sendTx(
  wallet: any,
  publicClient: any,
  to: Address,
  data: Hex,
  label: string
) {
  const hash = await wallet.sendTransaction({
    account: wallet.account,
    to,
    data,
    value: 0n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} failed: ${hash}`);
  }
  return hash;
}

function buildV4SwapInputs(): { commands: Hex; inputs: Hex[] } {
  const tokenIn = TOKEN_IN_ADDRESS;
  const tokenOut = TOKEN_OUT_ADDRESS;
  const zeroForOne = true;

  const poolKey = {
    currency0: tokenIn,
    currency1: tokenOut,
    fee: 10_000, // 0x2710
    tickSpacing: 200, // 0x00c8
    hooks: "0x660C8Ead7d8A6c66BAd7d19a12703ca173eAC0Cc" as Address,
  };

  const minAmountOut = 1n;
  const currentConfig = {
    poolKey,
    zeroForOne,
    amountIn: SUPER_USDC_AMOUNT.toString(),
    amountOutMinimum: minAmountOut.toString(),
    hookData: "0x",
  };

  const v4Planner = new V4Planner();
  v4Planner.addAction(
    Actions.SWAP_EXACT_IN_SINGLE,
    [currentConfig],
    URVersion.V2_0
  );
  v4Planner.addAction(
    Actions.SETTLE_ALL,
    [currentConfig.poolKey.currency0, currentConfig.amountIn],
    URVersion.V2_0
  );
  v4Planner.addAction(
    Actions.TAKE_ALL,
    [currentConfig.poolKey.currency1, currentConfig.amountOutMinimum],
    URVersion.V2_0
  );

  const v4SwapInput = v4Planner.finalize();
  const planner = new RoutePlanner();
  planner.addCommand(CommandType.V4_SWAP, [v4SwapInput]);

  const commands = normalizeHex(planner.commands);
  const inputs = planner.inputs.map((input: string) => normalizeHex(input));

  return { commands, inputs };
}

async function main() {
  const privateKey = requireEnv("PRIVATE_KEY") as `0x${string}`;
  const rpcUrl = process.env.RPC_URL || RPC_URL;

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  console.log("RFUSDC amount (6 decimals):", RFUSDC_AMOUNT.toString());
  console.log("SuperFakeUSDC amount (18 decimals):", SUPER_USDC_AMOUNT.toString());

  const { commands, inputs } = buildV4SwapInputs();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  // 0) Mint RFUSDC to EOA
  await sendTx(
    walletClient,
    publicClient,
    RFUSDC_ADDRESS as Address,
    encodeFunctionData({
      abi: RFUSDC_MINT_ABI,
      functionName: "mint",
      args: [account.address, RFUSDC_AMOUNT],
    }),
    "mint RFUSDC"
  );

  // 1) Approve Super Fake USDC to spend RFUSDC, then upgrade
  await sendTx(
    walletClient,
    publicClient,
    RFUSDC_ADDRESS as Address,
    encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [SUPER_FAKE_USDC_ADDRESS as Address, RFUSDC_AMOUNT],
    }),
    "approve RFUSDC -> Super Fake USDC"
  );
  await sendTx(
    walletClient,
    publicClient,
    SUPER_FAKE_USDC_ADDRESS as Address,
    encodeFunctionData({
      abi: SUPER_FAKE_USDC_UPGRADE_ABI,
      functionName: "upgrade",
      args: [SUPER_USDC_AMOUNT],
    }),
    "upgrade to Super Fake USDC"
  );

  const rfusdcBalance = await publicClient.readContract({
    address: RFUSDC_ADDRESS as Address,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  const superFakeBalance = await publicClient.readContract({
    address: SUPER_FAKE_USDC_ADDRESS as Address,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log("RFUSDC balance after upgrade:", rfusdcBalance);
  console.log("Super Fake USDC balance after upgrade:", superFakeBalance);

  // 2) Approve Permit2 to spend Super Fake USDC
  await sendTx(
    walletClient,
    publicClient,
    SUPER_FAKE_USDC_ADDRESS as Address,
    encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [PERMIT2_ADDRESS as Address, MAX_UINT256],
    }),
    "approve Super Fake USDC -> Permit2"
  );

  // 3) Permit2 approve router (AllowanceTransfer.approve)
  await sendTx(
    walletClient,
    publicClient,
    PERMIT2_ADDRESS as Address,
    encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [
        SUPER_FAKE_USDC_ADDRESS as Address,
        UNISWAP_UNIVERSAL_ROUTER_ADDRESS as Address,
        MAX_UINT160,
        MAX_UINT48,
      ] as any,
    }),
    "permit2 approve -> UniversalRouter"
  );

  // 3.5) Allowance checks (ERC20 + Permit2)
  const erc20Allowance = await publicClient.readContract({
    address: SUPER_FAKE_USDC_ADDRESS as Address,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: "allowance",
    args: [account.address, PERMIT2_ADDRESS as Address],
  });
  const permit2Allowance = await publicClient.readContract({
    address: PERMIT2_ADDRESS as Address,
    abi: PERMIT2_ABI,
    functionName: "allowance",
    args: [
      account.address,
      SUPER_FAKE_USDC_ADDRESS as Address,
      UNISWAP_UNIVERSAL_ROUTER_ADDRESS as Address,
    ],
  });
  console.log("ERC20 allowance -> Permit2:", erc20Allowance);
  console.log("Permit2 allowance -> Router:", permit2Allowance);

  // 3) Execute Uniswap V4 swap (commands 0x10, inputs encoded)
  const swapData = encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [commands, inputs, deadline],
  });

  const swapHash = await sendTx(
    walletClient,
    publicClient,
    UNISWAP_UNIVERSAL_ROUTER_ADDRESS as Address,
    swapData,
    "uniswap v4 swap"
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        swapTxHash: swapHash,
        account: account.address,
        amountIn: SUPER_USDC_AMOUNT.toString(),
        tokenIn: SUPER_FAKE_USDC_ADDRESS,
        tokenOut: TOKEN_OUT_ADDRESS,
        router: UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
        deadline: deadline.toString(),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
