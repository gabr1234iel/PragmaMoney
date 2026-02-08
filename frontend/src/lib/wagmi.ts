import { http, createConfig } from "wagmi";
import { baseSepolia, mainnet } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";

export const config = createConfig({
  chains: [baseSepolia, mainnet],
  connectors: [
    injected({ target: "metaMask" }),
    coinbaseWallet({
      appName: "PragmaMoney",
      appLogoUrl: undefined,
    }),
  ],
  transports: {
    [baseSepolia.id]: http(
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org"
    ),
    [mainnet.id]: http(
      process.env.NEXT_PUBLIC_MAINNET_RPC || "https://cloudflare-eth.com"
    ),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
