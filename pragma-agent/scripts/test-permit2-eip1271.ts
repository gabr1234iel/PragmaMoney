/**
 * Test: Permit2.permit() with EIP-1271 signature validation
 *
 * Flow:
 * 1. Operator EOA signs Permit2 PermitSingle struct
 * 2. Call Permit2.permit(smartAccount, permitSingle, signature) via UserOp
 * 3. Permit2 calls smartAccount.isValidSignature() to verify
 * 4. If valid, Permit2 sets allowance for the router
 * 5. Execute swap
 */

import "dotenv/config";
import { JsonRpcProvider, Wallet, Contract, keccak256, AbiCoder, solidityPackedKeccak256 } from "ethers";
import { bytesToHex, hexToBytes, encodeFunctionData, type Address, type Hex } from "viem";
import {
  loadOrCreateWalletByFile,
  getRegistrationByFile,
} from "../src/wallet.js";
import {
  sendUserOp,
  buildMintCall,
  buildApproveCall,
  buildUpgradeCall,
} from "../src/userop.js";
import {
  RPC_URL,
  RFUSDC_ADDRESS,
  SUPER_FAKE_USDC_ADDRESS,
  BINGER_TOKEN_ADDRESS,
  PERMIT2_ADDRESS,
  UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
  ERC20_ABI,
  PIMLICO_API_KEY,
} from "../src/config.js";

const { RoutePlanner, CommandType } = require("@uniswap/universal-router-sdk");
const { Actions, URVersion, V4Planner } = require("@uniswap/v4-sdk");

// Permit2 types for EIP-712
const PERMIT2_DOMAIN = {
  name: "Permit2",
  chainId: 84532n, // Base Sepolia
  verifyingContract: PERMIT2_ADDRESS as `0x${string}`,
};

const PERMIT_SINGLE_TYPEHASH = keccak256(
  Buffer.from(
    "PermitSingle(PermitDetails details,address spender,uint256 sigDeadline)PermitDetails(address token,uint160 amount,uint48 expiration,uint48 nonce)"
  )
);

const PERMIT_DETAILS_TYPEHASH = keccak256(
  Buffer.from("PermitDetails(address token,uint160 amount,uint48 expiration,uint48 nonce)")
);

// Permit2 ABI for permit function
const PERMIT2_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      {
        name: "permitSingle",
        type: "tuple",
        components: [
          {
            name: "details",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint160" },
              { name: "expiration", type: "uint48" },
              { name: "nonce", type: "uint48" },
            ],
          },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    name: "permit",
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

function normalizeHex(value: string): `0x${string}` {
  const hex = (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
  return bytesToHex(hexToBytes(hex));
}

async function getPermit2Nonce(
  provider: JsonRpcProvider,
  owner: string,
  token: string,
  spender: string
): Promise<bigint> {
  const permit2 = new Contract(PERMIT2_ADDRESS, PERMIT2_ABI, provider);
  const [, , nonce] = await permit2.allowance(owner, token, spender);
  return BigInt(nonce);
}

function hashPermitDetails(
  token: string,
  amount: bigint,
  expiration: bigint,
  nonce: bigint
): string {
  const abiCoder = AbiCoder.defaultAbiCoder();
  return keccak256(
    abiCoder.encode(
      ["bytes32", "address", "uint160", "uint48", "uint48"],
      [PERMIT_DETAILS_TYPEHASH, token, amount, expiration, nonce]
    )
  );
}

function hashPermitSingle(
  token: string,
  amount: bigint,
  expiration: bigint,
  nonce: bigint,
  spender: string,
  sigDeadline: bigint
): string {
  const detailsHash = hashPermitDetails(token, amount, expiration, nonce);
  const abiCoder = AbiCoder.defaultAbiCoder();
  return keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "address", "uint256"],
      [PERMIT_SINGLE_TYPEHASH, detailsHash, spender, sigDeadline]
    )
  );
}

function getPermit2DomainSeparator(): string {
  const abiCoder = AbiCoder.defaultAbiCoder();
  const typeHash = keccak256(
    Buffer.from("EIP712Domain(string name,uint256 chainId,address verifyingContract)")
  );
  return keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "uint256", "address"],
      [typeHash, keccak256(Buffer.from("Permit2")), 84532n, PERMIT2_ADDRESS]
    )
  );
}

function getPermitDigest(
  token: string,
  amount: bigint,
  expiration: bigint,
  nonce: bigint,
  spender: string,
  sigDeadline: bigint
): string {
  const structHash = hashPermitSingle(token, amount, expiration, nonce, spender, sigDeadline);
  const domainSeparator = getPermit2DomainSeparator();
  return keccak256(
    solidityPackedKeccak256(
      ["string", "bytes32", "bytes32"],
      ["\x19\x01", domainSeparator, structHash]
    )
  );
}

function buildPermit2PermitCall(
  owner: string,
  token: string,
  amount: bigint,
  expiration: bigint,
  nonce: bigint,
  spender: string,
  sigDeadline: bigint,
  signature: string
): { target: `0x${string}`; value: bigint; data: `0x${string}` } {
  const data = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: "permit",
    args: [
      owner as Address,
      {
        details: {
          token: token as Address,
          amount,
          expiration: Number(expiration),
          nonce: Number(nonce),
        },
        spender: spender as Address,
        sigDeadline,
      },
      signature as Hex,
    ],
  });

  return {
    target: PERMIT2_ADDRESS as `0x${string}`,
    value: 0n,
    data,
  };
}

function buildUniversalRouterExecuteCall(
  router: `0x${string}`,
  commands: `0x${string}`,
  inputs: `0x${string}`[],
  deadline: bigint
): { target: `0x${string}`; value: bigint; data: `0x${string}` } {
  const data = encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [commands, inputs, deadline],
  });

  return {
    target: router,
    value: 0n,
    data,
  };
}

async function main() {
  console.log("=== Permit2.permit() with EIP-1271 Test ===\n");

  if (!PIMLICO_API_KEY) {
    console.error("PIMLICO_API_KEY required");
    process.exit(1);
  }

  const walletA = loadOrCreateWalletByFile("wallet.json");
  const regA = getRegistrationByFile("wallet.json");

  if (!regA) {
    console.error("Agent A not registered. Run E2E test first.");
    process.exit(1);
  }

  console.log(`Smart Account: ${regA.smartAccount}`);
  console.log(`Operator: ${walletA.address}\n`);

  const provider = new JsonRpcProvider(RPC_URL);
  const operatorWallet = new Wallet(walletA.privateKey, provider);
  const swapAmount = 1_000_000n; // 1 token (6 decimals)
  const router = UNISWAP_UNIVERSAL_ROUTER_ADDRESS as `0x${string}`;
  const token = SUPER_FAKE_USDC_ADDRESS;
  const maxUint160 = (1n << 160n) - 1n;
  const maxUint48 = (1n << 48n) - 1n;

  // Step 1: Mint RFUSDC
  console.log("1/7 Minting RFUSDC...");
  const r1 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildMintCall(RFUSDC_ADDRESS as `0x${string}`, regA.smartAccount as `0x${string}`, swapAmount)],
    { skipSponsorship: true }
  );
  console.log(`  tx: ${r1.txHash}\n`);

  // Step 2: Approve SuperFakeUSDC to spend RFUSDC
  console.log("2/7 Approving SuperFakeUSDC to spend RFUSDC...");
  await new Promise((r) => setTimeout(r, 3000));
  const r2 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildApproveCall(RFUSDC_ADDRESS as `0x${string}`, SUPER_FAKE_USDC_ADDRESS as `0x${string}`, swapAmount)],
    { skipSponsorship: true }
  );
  console.log(`  tx: ${r2.txHash}\n`);

  // Step 3: Upgrade RFUSDC → SuperFakeUSDC
  console.log("3/7 Upgrading RFUSDC → SuperFakeUSDC...");
  await new Promise((r) => setTimeout(r, 3000));
  const r3 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildUpgradeCall(SUPER_FAKE_USDC_ADDRESS as `0x${string}`, swapAmount)],
    { skipSponsorship: true }
  );
  console.log(`  tx: ${r3.txHash}\n`);

  // Step 4: Approve Permit2 to spend SuperFakeUSDC (ERC20 approve)
  console.log("4/7 Approving Permit2 to spend SuperFakeUSDC (ERC20)...");
  await new Promise((r) => setTimeout(r, 3000));
  const r4 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [buildApproveCall(SUPER_FAKE_USDC_ADDRESS as `0x${string}`, PERMIT2_ADDRESS as `0x${string}`, maxUint160)],
    { skipSponsorship: true }
  );
  console.log(`  tx: ${r4.txHash}\n`);

  // Step 5: Sign Permit2 permit and call via UserOp
  console.log("5/7 Signing Permit2 permit (EIP-712) and calling via UserOp...");
  await new Promise((r) => setTimeout(r, 5000));

  // Get current nonce from Permit2
  const nonce = await getPermit2Nonce(provider, regA.smartAccount, token, router);
  console.log(`  Permit2 nonce: ${nonce}`);

  const expiration = maxUint48;
  const sigDeadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  // Compute the EIP-712 digest
  const digest = getPermitDigest(token, maxUint160, expiration, nonce, router, sigDeadline);
  console.log(`  Digest: ${digest}`);

  // Operator signs the digest
  const signature = await operatorWallet.signMessage(Buffer.from(digest.slice(2), "hex"));
  console.log(`  Signature: ${signature.slice(0, 20)}...`);

  // Call Permit2.permit() via UserOp - Permit2 will call isValidSignature on smart account
  const permitCall = buildPermit2PermitCall(
    regA.smartAccount,
    token,
    maxUint160,
    expiration,
    nonce,
    router,
    sigDeadline,
    signature
  );

  const r5 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [permitCall],
    { skipSponsorship: true }
  );
  console.log(`  tx: ${r5.txHash}\n`);

  // Step 6: Verify Permit2 allowance is set
  console.log("6/7 Verifying Permit2 allowance...");
  await new Promise((r) => setTimeout(r, 3000));
  const permit2 = new Contract(PERMIT2_ADDRESS, PERMIT2_ABI, provider);
  const [amount, exp, n] = await permit2.allowance(regA.smartAccount, token, router);
  console.log(`  Permit2 allowance: amount=${amount}, expiration=${exp}, nonce=${n}`);

  if (amount === 0n) {
    console.error("  FAIL: Permit2 allowance not set!");
    process.exit(1);
  }
  console.log("  PASS\n");

  // Step 7: Execute swap
  console.log("7/7 Executing V4 swap...");

  const poolKey = {
    currency0: SUPER_FAKE_USDC_ADDRESS as `0x${string}`,
    currency1: BINGER_TOKEN_ADDRESS as `0x${string}`,
    fee: 10000,
    tickSpacing: 200,
    hooks: "0x660C8Ead7d8A6c66BAd7d19a12703ca173eAC0Cc" as `0x${string}`,
  };

  const swapConfig = {
    poolKey,
    zeroForOne: true,
    amountIn: swapAmount.toString(),
    amountOutMinimum: "1",
    hookData: "0x",
  };

  const v4Planner = new V4Planner();
  v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [swapConfig], URVersion.V2_0);
  v4Planner.addAction(Actions.SETTLE_ALL, [swapConfig.poolKey.currency0, swapConfig.amountIn], URVersion.V2_0);
  v4Planner.addAction(Actions.TAKE_ALL, [swapConfig.poolKey.currency1, "1"], URVersion.V2_0);

  const v4SwapInput = v4Planner.finalize();
  const planner = new RoutePlanner();
  planner.addCommand(CommandType.V4_SWAP, [v4SwapInput]);

  const commands = normalizeHex(planner.commands);
  const inputs = planner.inputs.map((input: string) => normalizeHex(input));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  const swapCall = buildUniversalRouterExecuteCall(router, commands, inputs, deadline);
  const r7 = await sendUserOp(
    regA.smartAccount as `0x${string}`,
    walletA.privateKey as `0x${string}`,
    [swapCall],
    { skipSponsorship: true }
  );
  console.log(`  tx: ${r7.txHash}\n`);

  // Check result
  const bingerToken = new Contract(BINGER_TOKEN_ADDRESS, ERC20_ABI, provider);
  const balance: bigint = await bingerToken.balanceOf(regA.smartAccount);
  console.log(`BingerToken balance: ${balance} units`);
  console.log("\n=== PERMIT2 EIP-1271 TEST SUCCESS ===");
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
