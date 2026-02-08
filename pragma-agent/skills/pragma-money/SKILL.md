---
name: pragma-money
description: Register on-chain, manage wallets, browse services, and pay for API calls on PragmaMoney (Base Sepolia)
user-invocable: true
metadata: {"openclaw": {"emoji": "\ud83d\udcb0", "requires": {"bins": ["pragma-agent"], "env": ["PIMLICO_API_KEY"]}, "primaryEnv": "PIMLICO_API_KEY", "install": [{"id": "npm", "kind": "node", "package": "pragma-agent", "bins": ["pragma-agent"], "label": "Install pragma-agent (npm)"}]}}
---

# PragmaMoney

You have the `pragma-agent` CLI. It lets you register an on-chain identity, deploy a smart wallet, browse services, and pay for API calls using USDC on Base Sepolia.

All commands output JSON. Parse the JSON to understand the result. If a command fails, read the error and report it to the user.

## Getting Started (first-time setup)

Before using any service, you must register. This creates three things:
1. **Identity NFT** (ERC-8004) owned by your agent EOA
2. **Smart wallet** (ERC-4337) with spending policy (daily limit, allowed targets, expiry)
3. **Funding pool** (ERC-4626 vault) where investors deposit USDC for your agent

### Step 1: Check if already registered

```bash
pragma-agent wallet address
```

If `"registered": true`, skip to "Using Services" below.

### Step 2: Register

```bash
pragma-agent register \
  --name "AgentName" \
  --endpoint "https://agent-endpoint.com" \
  --daily-limit 100 \
  --expiry-days 90 \
  --pool-daily-cap 50
```

This takes 30-60 seconds. **Do not interrupt or re-run.** The command:
- Gets ETH funding from the relayer (for on-chain gas)
- Mints your identity NFT on-chain
- Deploys your smart wallet with spending policy
- Binds the smart wallet to your identity
- Creates an investor funding pool
- Funds your smart wallet with ETH for UserOp gas

On success you get `agentId`, `smartAccountAddress`, and `poolAddress`.

### Step 3: Verify balances

```bash
pragma-agent wallet balance
```

You should see ETH in both EOA and smart account, and 0 USDC until investors fund your pool.

## Registering a Service

Once registered as an agent, you can monetize your endpoints by registering services on-chain.

```bash
pragma-agent services register \
  --name "My API" \
  --price 0.001 \
  --endpoint "https://api.myservice.com" \
  --type API
```

This registers the service on the ServiceRegistry contract via a UserOp (smart wallet pays gas). The proxy is also notified so it can route traffic. On success you get a `serviceId` and `proxyUrl`.

Service types: `COMPUTE`, `STORAGE`, `API`, `AGENT`, `OTHER` (default: `API`).

**Requirements**: Agent must be registered (identity + wallet + pool). Smart wallet needs ETH for gas.

## Using Services

### Browse available services

```bash
pragma-agent services list                          # all services
pragma-agent services get --service-id 0x...        # one service's details
pragma-agent services search --query "keyword"      # search by name
```

### Pay and call a service (most common)

```bash
pragma-agent call --service-id 0x... --method GET
pragma-agent call --service-id 0x... --method POST --body '{"key":"val"}'
```

One command: pays USDC on-chain via your smart wallet, then calls the API. The response is in the `"response"` field.

### Pay only (no API call)

```bash
pragma-agent pay pay --service-id 0x... --calls 1 --score 85
pragma-agent pay verify --payment-id 0x...
```

**Reputation scoring (required)**:
- Every `pay` must include a `--score` (0-100).
- Use a subjective score based on the agent's judgment of service quality.
- Suggested anchors: 100 = excellent, 70 = acceptable, 30 = poor, 0 = failed.

## Managing Your Wallet

```bash
pragma-agent wallet address          # EOA + smart account + registration status
pragma-agent wallet balance          # ETH + USDC balances for both EOA and smart account
pragma-agent wallet policy           # spending policy: daily limit, daily spend, expiry date
```

**Important**: Your smart wallet enforces a spending policy. Check `wallet policy` before large transactions:
- `dailyLimit`: max USDC spendable per day
- `expiresAt`: policy expiry (after this, all UserOps are rejected)
- `dailySpend`: how much has been spent today (resets midnight UTC)

## Managing Your Pool

Your pool is an ERC-4626 vault funded by investors. You can pull USDC from it into your smart wallet, subject to a daily cap.

```bash
pragma-agent pool info                        # pool metadata, total assets, daily cap
pragma-agent pool remaining                   # how much USDC you can still pull today
pragma-agent pool pull --amount 5.00          # withdraw 5 USDC from pool into smart wallet
```

**Pool pull uses a UserOp** (ERC-4337 transaction through EntryPoint). Your smart wallet pays the gas from its own ETH balance.

If `pool pull` fails with a gas error, your smart wallet may need more ETH. Report this to the user.

## Investing in Agent Pools

You can invest USDC from your smart wallet into any agent's pool (including your own). This deposits USDC into the target agent's ERC-4626 vault.

```bash
pragma-agent pool invest --target-agent-id 42 --amount 1.00   # invest 1 USDC into agent 42's pool
pragma-agent pool invest --target-agent-id 100 --amount 5.00  # invest 5 USDC into agent 100's pool
```

The invest command transparently:
1. Looks up the target agent's pool on-chain
2. Requests the deployer to approve the target pool as a spending target on your smart wallet
3. Sends a UserOp batch: approve USDC + deposit into pool

**Requirements**: Your smart wallet must have enough USDC and ETH (for gas). The target agent must have a pool.

## Typical Workflow

1. `pragma-agent wallet address` -- check registration status
2. `pragma-agent register ...` -- one-time setup (if not registered)
3. `pragma-agent services list` -- find services to use
4. `pragma-agent pool pull --amount 10.00` -- pull USDC from pool (if balance is low)
5. `pragma-agent call --service-id 0x... --method GET` -- pay + call

## Commands Reference

| Command | Description |
|---------|-------------|
| `pragma-agent register --name ... --endpoint ... --daily-limit N --expiry-days N --pool-daily-cap N` | One-time registration |
| `pragma-agent wallet address` | Registration status |
| `pragma-agent wallet balance` | ETH + USDC balances |
| `pragma-agent wallet policy` | Spending policy |
| `pragma-agent services list` | All services |
| `pragma-agent services get --service-id 0x...` | Service details |
| `pragma-agent services search --query "..."` | Search services |
| `pragma-agent services register --name ... --price N --endpoint URL [--type API]` | Register a service on-chain |
| `pragma-agent pool info` | Pool metadata |
| `pragma-agent pool remaining` | Remaining daily cap |
| `pragma-agent pool pull --amount N` | Pull USDC from pool |
| `pragma-agent pool invest --target-agent-id ID --amount N` | Invest USDC in agent's pool |
| `pragma-agent call --service-id 0x... --method GET/POST [--body '...']` | Pay + call |
| `pragma-agent pay pay --service-id 0x... --calls N` | Pay only |
| `pragma-agent pay verify --payment-id 0x...` | Verify payment |

## Errors

| Error | Fix |
|-------|-----|
| `Agent not registered` | Run `pragma-agent register` |
| `Insufficient USDC balance` | Run `pragma-agent pool pull --amount X` |
| `Daily cap exceeded` | Wait until tomorrow (resets midnight UTC) |
| `PIMLICO_API_KEY not set` | Set the `PIMLICO_API_KEY` environment variable |
| `Fund phase failed` | The relayer proxy is not running or unreachable |
| `Agent is already registered` | Already set up, proceed to use services |
| `UserOp failed on-chain` | Check smart wallet ETH balance and spending policy |

## Notes

- USDC uses 6 decimals. Use human-readable amounts in commands (e.g. `5.00` not `5000000`).
- Registration is idempotent per wallet. Re-running returns the existing registration.
- The wallet file is at `~/.openclaw/pragma-agent/wallet.json`.
- `RELAYER_URL` must be set to the PragmaMoney proxy's public URL (default is localhost, which only works for local dev).
- Pool pulls and service payments go through ERC-4337 UserOperations. The smart wallet pays gas from its own ETH.
