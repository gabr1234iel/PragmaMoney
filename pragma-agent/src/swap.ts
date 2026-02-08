import { bytesToHex, hexToBytes } from "viem";
import {
  BINGER_TOKEN_ADDRESS,
  RFUSDC_ADDRESS,
  SUPER_FAKE_USDC_ADDRESS,
  PERMIT2_ADDRESS,
  UNISWAP_UNIVERSAL_ROUTER_ADDRESS,
} from "./config.js";
import { loadOrCreateWallet, requireRegistration } from "./wallet.js";
import {
  sendUserOp,
  buildApproveCall,
  buildMintCall,
  buildUpgradeCall,
  buildUniversalRouterExecuteCall,
  buildPermit2ApproveCall,
} from "./userop.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RoutePlanner, CommandType } = require("@uniswap/universal-router-sdk");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Actions, URVersion, V4Planner } = require("@uniswap/v4-sdk");

function normalizeHex(value: string): `0x${string}` {
  const hex = (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
  return bytesToHex(hexToBytes(hex));
}

export interface SwapInput {
  action: "swap-v4";
  rpcUrl?: string;
}

export async function handleSwap(input: SwapInput): Promise<string> {
  try {
    if (input.action !== "swap-v4") {
      return JSON.stringify({ error: `Unknown action: ${input.action}` });
    }

    const registration = requireRegistration();
    const walletData = loadOrCreateWallet();

    const router = UNISWAP_UNIVERSAL_ROUTER_ADDRESS as `0x${string}`;
    const tokenIn = SUPER_FAKE_USDC_ADDRESS as `0x${string}`;
    const tokenOut = BINGER_TOKEN_ADDRESS as `0x${string}`;

    const amountRaw = 1_000_000n; // 1 RFUSDC (6 decimals)
    const minAmountOut = 1n;

    const poolKey = {
      currency0: tokenIn,
      currency1: tokenOut,
      fee: 10000,
      tickSpacing: 200,
      hooks: "0x660C8Ead7d8A6c66BAd7d19a12703ca173eAC0Cc" as `0x${string}`,
    };

    const currentConfig = {
      poolKey,
      zeroForOne: true,
      amountIn: amountRaw.toString(),
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

    // 1) Mint RFUSDC to the smart account (fixed 1e18)
    await sendUserOp(
      registration.smartAccount as `0x${string}`,
      walletData.privateKey as `0x${string}`,
      [buildMintCall(RFUSDC_ADDRESS as `0x${string}`, registration.smartAccount as `0x${string}`, amountRaw)],
      { skipSponsorship: true }
    );

    // 2) Approve Super Real Fake USDC to spend RFUSDC
    await sendUserOp(
      registration.smartAccount as `0x${string}`,
      walletData.privateKey as `0x${string}`,
      [buildApproveCall(RFUSDC_ADDRESS as `0x${string}`, SUPER_FAKE_USDC_ADDRESS as `0x${string}`, amountRaw)],
      { skipSponsorship: true }
    );

    // 3) Upgrade RFUSDC -> Super Real Fake USDC
    await sendUserOp(
      registration.smartAccount as `0x${string}`,
      walletData.privateKey as `0x${string}`,
      [buildUpgradeCall(SUPER_FAKE_USDC_ADDRESS as `0x${string}`, amountRaw)],
      { skipSponsorship: true }
    );

    const maxUint160 = (1n << 160n) - 1n;
    const maxUint256 = (1n << 256n) - 1n;
    const maxUint48 = (1n << 48n) - 1n;

    // 4) Approve Permit2 to spend Super Real Fake USDC
    await sendUserOp(
      registration.smartAccount as `0x${string}`,
      walletData.privateKey as `0x${string}`,
      [
        buildApproveCall(
          SUPER_FAKE_USDC_ADDRESS as `0x${string}`,
          PERMIT2_ADDRESS as `0x${string}`,
          maxUint256
        ),
      ],
      { skipSponsorship: true }
    );

    // 5) Permit2 approve router (AllowanceTransfer.approve)
    await sendUserOp(
      registration.smartAccount as `0x${string}`,
      walletData.privateKey as `0x${string}`,
      [
        buildPermit2ApproveCall(
          PERMIT2_ADDRESS as `0x${string}`,
          SUPER_FAKE_USDC_ADDRESS as `0x${string}`,
          router,
          maxUint160,
          maxUint48
        ),
      ],
      { skipSponsorship: true }
    );

    // 6) Execute swap on Universal Router (deadline overload)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const result = await sendUserOp(
      registration.smartAccount as `0x${string}`,
      walletData.privateKey as `0x${string}`,
      [buildUniversalRouterExecuteCall(router, commands, inputs, deadline)],
      { skipSponsorship: true }
    );

    return JSON.stringify({
      success: result.success,
      txHash: result.txHash,
      userOpHash: result.userOpHash,
      router,
      tokenIn,
      tokenOut,
      amountIn: amountRaw.toString(),
      deadline: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

export const swapSchema = {
  name: "pragma-swap-v4",
  description:
    "Execute a Uniswap V4 Universal Router swap via the agent smart account using a 4337 UserOperation.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: { type: "string" as const, enum: ["swap-v4"] },
      rpcUrl: { type: "string" as const },
    },
    required: ["action"],
  },
};
