# pragma-agent — PragmaMoney CLI + OpenClaw Skill

A CLI tool and OpenClaw skill that gives AI agents the ability to register on-chain, manage wallets, browse services, and pay for API calls on PragmaMoney (Base Sepolia / Arc testnet).

## Quick Start

```bash
cd pragma-agent
npm install && npm run build
npm link  # makes `pragma-agent` available globally

# Set environment variables
export PIMLICO_API_KEY=pim_R9KtmJWQiydF7eX7mgpGsZ
export RELAYER_URL=http://localhost:4402

# Test it
pragma-agent wallet address
pragma-agent services list
```

## CLI Usage

```
pragma-agent register   --name "X" --endpoint "https://..." --daily-limit 100 --expiry-days 90 --pool-daily-cap 50
pragma-agent wallet     [balance|address|policy]
pragma-agent services   [list|get --service-id 0x...|search --query "keyword"]
pragma-agent pool       [info|remaining|pull --amount 5.00]
pragma-agent pay        [pay --service-id 0x... --calls 1|verify --payment-id 0x...]
pragma-agent call       --service-id 0x... [--method POST] [--body '{"key":"val"}']
```

All commands output JSON to stdout. Exit code 0 on success, 1 on error.

Run `pragma-agent --help` for full usage info.

## Architecture

```
VPS (Contabo / any Linux server)          Your machine / separate server
┌──────────────────────────────┐          ┌──────────────────────────────┐
│  OpenClaw + pragma-agent CLI │  ←HTTP→  │  Proxy server (port 4402)    │
│  (agent runtime)             │          │  (registration relay,        │
│                              │          │   payment verification,      │
│  ~/.openclaw/pragma-agent/   │          │   API forwarding)            │
│    wallet.json               │          │                              │
│                              │          │  Uses deployer key (0x567b)  │
└──────────────────────────────┘          └──────────────────────────────┘
         │                                         │
         └──── Base Sepolia RPC ───────────────────┘
```

The AI agent reads the SKILL.md instructions, then runs `pragma-agent` CLI commands via bash. This matches the established OpenClaw pattern (oracle, himalaya skills). The proxy server can run anywhere the agent can reach over HTTP.

## VPS Setup (Contabo / Any Linux VPS)

### Prerequisites

- **Node.js 22+**
- **git**
- **Pimlico API key** (free tier at [pimlico.io](https://pimlico.io)) — required for UserOps

### 1. Install Node.js

```bash
apt-get update && apt-get install -y git curl build-essential unzip

# Install Node.js 22 via fnm
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 22 && fnm use 22 && fnm default 22
node -v  # should print v22.x.x
```

### 2. Clone & build pragma-agent

```bash
cd ~
git clone https://github.com/gabr1234iel/PragmaMoney.git
cd PragmaMoney/pragma-agent
npm install && npm run build && npm link
```

### 3. Configure environment

```bash
cat > .env <<'EOF'
# Required for UserOps (pay, pool pull, call services)
PIMLICO_API_KEY=pim_R9KtmJWQiydF7eX7mgpGsZ

# Proxy relayer URL (where the proxy server is running)
# If proxy is on the same VPS: http://localhost:4402
# If proxy is on another machine: http://<proxy-ip>:4402
RELAYER_URL=http://localhost:4402
EOF
```

### 4. Test CLI

```bash
pragma-agent --help
pragma-agent wallet address
```

### 5. Install OpenClaw & register skill

```bash
# Install OpenClaw
curl -fsSL https://openclaw.ai/install.sh | bash

# Option A: Add as load path in config
openclaw config set plugins.load.paths '["~/PragmaMoney/pragma-agent"]'

# Option B: Copy skill manually
mkdir -p ~/.openclaw/skills/pragma-money
cp skills/pragma-money/SKILL.md ~/.openclaw/skills/pragma-money/
```

### 6. Run OpenClaw

```bash
openclaw
```

In the OpenClaw chat:
```
> Register yourself as "MyTestAgent" at endpoint https://myagent.example.com
> with a daily limit of 100 USDC, 90-day expiry, and pool daily cap of 50 USDC.
```

## Proxy Setup (separate server)

The proxy relayer handles deployer-signed transactions. Run it on a server with the deployer private key:

```bash
cd PragmaMoney/proxy
npm install && npm run build

cat > .env <<'EOF'
PROXY_SIGNER_KEY=<your-deployer-private-key>
ADMIN_TOKEN=changeme
EOF

npm run dev  # listens on port 4402
```

The proxy must be reachable from the VPS (public IP, ngrok tunnel, or Tailscale).

## Registration Flow

The 3-phase registration ensures the agent EOA owns its identity NFT:

```
1. POST /register-agent/fund     → Proxy sends 0.0005 ETH to agent EOA
2. Agent tx: register()           → Agent EOA calls IdentityRegistry (owns NFT)
3. POST /register-agent/setup     → Proxy deploys smart account + configures targets
4. Agent tx: setAgentWallet()     → Agent EOA binds smart account to identity
5. POST /register-agent/finalize  → Proxy creates investor pool + allows as target
```

## Notes on Uniswap SDK usage

The Uniswap SDKs depend on ethers v5 internals (e.g., `ethers/lib/utils`). This repo uses ethers v6 elsewhere, so `postinstall` runs `scripts/link-ethers-v5.js` to symlink ethers v5 into the SDKs. If you see `ERR_PACKAGE_PATH_NOT_EXPORTED`, rerun:

```bash
node scripts/link-ethers-v5.js
```

## Verify On-Chain State

| Check | URL |
|-------|-----|
| Agent EOA funded | `https://sepolia.basescan.org/address/<agent-eoa>#internaltx` |
| NFT owned by agent | `ownerOf(agentId)` on `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Smart account deployed | `https://sepolia.basescan.org/address/<smart-account>#code` |
| agentWallet set | `getAgentWallet(agentId)` on `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Pool created | `https://sepolia.basescan.org/address/<pool-address>#readContract` |

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `Fund phase failed` | Proxy not running or deployer out of ETH | Start proxy, fund deployer |
| `Failed to extract agentId` | register() tx failed | Check agent EOA has ETH for gas |
| `NFT owner mismatch` | Wrong agentId | Verify agentId from register() tx |
| `BadWallet (0x5c9c2255)` | Pool created before setAgentWallet | This is handled by 3-phase flow |
| `setAgentWallet expired` | 5-min deadline passed | Re-run setup for fresh deadline |
| `PIMLICO_API_KEY not set` | Missing env var | Set in .env before starting |
| `Agent already registered` | wallet.json has registration | Delete `~/.openclaw/pragma-agent/wallet.json` |

## Wallet File

Location: `~/.openclaw/pragma-agent/wallet.json`

```json
{
  "privateKey": "0x...",
  "address": "0x...",
  "createdAt": "2026-02-06T...",
  "registration": {
    "agentId": "213",
    "smartAccount": "0x...",
    "poolAddress": "0x...",
    "owner": "0x...",
    "registeredAt": "2026-02-06T...",
    "txHashes": { "fund": "0x...", "register": "0x...", ... }
  }
}
```

Delete this file to reset and re-register.

## Contract Addresses (Base Sepolia)

| Contract | Address |
|----------|---------|
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| AgentAccountFactory | `0x8B4294B349530d03Fe94C216fc771206637AFDa9` |
| AgentFactory (pools) | `0xcB016c9DC6c9bE4D6AaE84405B2686569F9cEc05` |
| ServiceRegistry | `0xe232b66B144C2cE3ec6174cEF704B3576d6cDa84` |
| x402Gateway | `0x3F13150Af381BE0Aa484630Bf72Ccf3cfAC4089A` |
| EntryPoint (v0.6) | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
