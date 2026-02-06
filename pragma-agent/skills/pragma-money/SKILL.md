---
name: pragma-money
description: Browse, pay for, and call services on PragmaMoney
metadata:
  openclaw:
    emoji: "\U0001F4B0"
    requires:
      bins: ["pragma-agent"]
    install:
      - id: "npm"
        kind: "node"
        package: "pragma-agent"
        bins: ["pragma-agent"]
        label: "Install pragma-agent (npm)"
---

# PragmaMoney Agent Workflow

## Overview

PragmaMoney is a payment gateway on Base Sepolia where AI agents can pay for and use API services. Services are registered on-chain in a **ServiceRegistry** contract. Agents pay via the **x402Gateway** contract using USDC, then call the service's proxy endpoint with the resulting paymentId.

The agent operates through a **policy-enforced smart account** (ERC-4337). All payments route through UserOperations submitted to the EntryPoint, which validates spending policies (daily limits, allowed targets, allowed tokens, expiry). Gas is sponsored by a Pimlico paymaster — the agent never needs ETH.

The lifecycle is: **Register -> Pull funds from pool -> Pay + call services**.

All commands output JSON. Use `pragma-agent --help` for full usage info.

---

## Step-by-Step Workflow

### 1. Register (One-Time Setup)

Before anything else, register the agent on PragmaMoney. This creates:
- An on-chain identity (ERC-721 NFT)
- A policy-enforced smart wallet (ERC-4337)
- An investor funding pool for the agent

```bash
pragma-agent register \
  --name "MyAgent" \
  --endpoint "https://myagent.com" \
  --daily-limit 100 \
  --expiry-days 90 \
  --pool-daily-cap 50
```

Optional flags: `--description "..."`, `--pool-vesting-days 30`, `--relayer-url http://...`

Registration uses a hybrid flow: the relayer funds gas and deploys infrastructure, while the agent performs identity operations on-chain:
1. Relayer sends ETH to agent EOA (for gas)
2. Agent EOA calls `register()` on IdentityRegistry (agent owns the NFT)
3. Relayer deploys the smart account, configures targets, and creates the pool
4. Agent EOA signs EIP-712 and calls `setAgentWallet()` (binds smart account to identity)
5. The agent's EOA owns the identity NFT, and the smart account is the payment wallet

After registration, your wallet file at `~/.openclaw/pragma-agent/wallet.json` stores the agentId, smart account address, and pool address.

### 2. Check Wallet

Verify your smart account has sufficient USDC for service payments.

```bash
pragma-agent wallet balance
```

This returns:
- **EOA ETH balance** (for reference; not used post-registration)
- **Smart account USDC balance** (main balance for payments)
- **Registration status** (agentId, smart account, pool address)

You can also inspect your spending policy:

```bash
pragma-agent wallet policy
```

This shows your daily spending limit, allowed target contracts, allowed tokens, and policy expiry.

To see wallet addresses and registration info:

```bash
pragma-agent wallet address
```

### 3. Browse Services

Discover what services are available on the PragmaMoney marketplace.

```bash
pragma-agent services list
```

This queries the on-chain ServiceRegistry and returns all active services with their names, types, pricing, and serviceIds. Service types include:
- **API** -- standard HTTP API endpoints
- **COMPUTE** -- compute-intensive services (image generation, inference)
- **STORAGE** -- data storage services
- **AGENT** -- other AI agent services
- **OTHER** -- uncategorized services

### 4. Get Service Details

Once you identify a service you want to use, get its full details.

```bash
pragma-agent services get --service-id 0x...
```

Or search by keyword:

```bash
pragma-agent services search --query "weather"
```

### 5. Pull Funds (If Needed)

If your smart account USDC balance is too low and you have an investor pool, pull funds.

First, check your remaining daily allowance:

```bash
pragma-agent pool remaining
```

If funds are available, pull what you need:

```bash
pragma-agent pool pull --amount 1.00
```

This sends a UserOperation through the smart account to transfer USDC from the investor pool. No need to specify `--pool-address` — it's saved from registration.

To see full pool details:

```bash
pragma-agent pool info
```

### 6. Pay and Call

This is the most common action. It combines payment and API invocation in a single step.

```bash
pragma-agent call --service-id 0x... --method POST --body '{"key":"value"}'
```

Under the hood, this:
1. **Batches** a USDC approve + payForService into a single UserOperation
2. **Submits** via the Pimlico bundler (gas sponsored by paymaster)
3. **Extracts** the paymentId from the on-chain receipt
4. **Calls** the service's proxy endpoint with the `x-payment-id` header
5. **Returns** the API response directly to you

Optional flags: `--calls 2` (pay for multiple calls), `--proxy-url http://...`

### 7. Pay Only (Without HTTP Call)

If you need to pay without making an HTTP call:

```bash
pragma-agent pay pay --service-id 0x... --calls 1
```

### 8. Verify Payment (Optional)

If you need to confirm a payment was recorded correctly on-chain:

```bash
pragma-agent pay verify --payment-id 0x...
```

---

## USDC Conventions

- USDC uses **6 decimals**: `1000000` raw units = 1.00 USDC
- When specifying amounts in CLI flags, use the **human-readable form** (e.g., `"0.01"`) -- the tools handle conversion
- Balances are returned in human-readable form (e.g., `"12.50"`)

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| **Agent not registered** | Called pay/pool/call before registering | Run `pragma-agent register` first |
| **Insufficient USDC balance** | Smart account lacks USDC | Pull funds from pool with `pragma-agent pool pull` |
| **Daily cap exceeded** | Pool daily withdrawal limit reached | Wait until next day (resets at midnight UTC) |
| **Daily spend limit exceeded** | Smart account policy daily limit reached | Wait until next day |
| **PIMLICO_API_KEY not set** | No bundler configured | Set PIMLICO_API_KEY environment variable |
| **UserOp failed** | Smart account policy rejected the operation | Check policy with `pragma-agent wallet policy` |
| **Agent revoked** | Pool owner revoked access | Cannot pull funds — needs re-authorization |
| **Service not active** | Service deactivated by owner | Choose a different service |
| **Payment replay** | paymentId already used at proxy | Make a new payment |
| **Policy violation: target not allowed** | Target contract not in allowed list | Contact platform to add target |
| **Policy violation: token not allowed** | Token not in allowed list | Contact platform to add token |
| **Policy expired** | Spending policy past expiry timestamp | Contact platform for policy renewal |

When encountering errors, always check your wallet state first with `pragma-agent wallet balance` and `pragma-agent wallet policy`.

---

## Command Reference

| Command | Subcommand | Description |
|---------|-----------|-------------|
| `pragma-agent register` | | One-time setup: create identity, smart wallet, and pool |
| `pragma-agent wallet` | `balance` | Check ETH/USDC balances |
| `pragma-agent wallet` | `address` | Show EOA, smart account, agentId, pool address |
| `pragma-agent wallet` | `policy` | Show spending policy and daily spend |
| `pragma-agent services` | `list` | List all registered services |
| `pragma-agent services` | `get --service-id 0x...` | Get details for a specific service |
| `pragma-agent services` | `search --query "..."` | Search services by keyword |
| `pragma-agent pool` | `info` | Show pool metadata and balances |
| `pragma-agent pool` | `remaining` | Show remaining daily pull cap |
| `pragma-agent pool` | `pull --amount X.XX` | Pull USDC from pool to smart account |
| `pragma-agent pay` | `pay --service-id 0x...` | Pay for N calls (no HTTP call) |
| `pragma-agent pay` | `verify --payment-id 0x...` | Check if paymentId is valid on-chain |
| `pragma-agent call` | `--service-id 0x...` | Pay + HTTP call in one step |

---

## Example Conversation

```
User: Can you register yourself and find services?

Agent: Let me register first.
> pragma-agent register --name "WeatherBot" --endpoint "https://weather.example.com" --daily-limit 50 --expiry-days 90 --pool-daily-cap 20
-> {"success":true,"agentId":"3","smartAccountAddress":"0xABC...","poolAddress":"0xDEF..."}

Agent: Now let me check my balance and browse services.
> pragma-agent wallet balance
-> {"registered":true,"usdcBalance":"0.00","smartAccountAddress":"0xABC..."}

Agent: I need funds. Let me pull from my pool.
> pragma-agent pool remaining
-> {"remainingCapToday":"20.00","dailyCap":"20.00"}

> pragma-agent pool pull --amount 5.00
-> {"success":true,"amount":"5.00","txHash":"0x..."}

Agent: Now let me find a service.
> pragma-agent services list
-> {"services":[{"name":"NanoBanana","pricePerCall":"0.01"},{"name":"WeatherAPI","pricePerCall":"0.005"}],"total":2}

> pragma-agent call --service-id 0xdef... --method POST --body '{"city":"San Francisco"}'
-> {"success":true,"response":"{\"city\":\"San Francisco\",\"temperature\":\"62F\"}","totalCost":"0.005"}

Agent: San Francisco is 62F. That cost 0.005 USDC.
```

---

## Network Details

| Parameter | Value |
|-----------|-------|
| **Chain** | Base Sepolia |
| **Chain ID** | 84532 |
| **RPC** | `https://sepolia.base.org` |
| **USDC** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| **ServiceRegistry** | `0xe232b66B144C2cE3ec6174cEF704B3576d6cDa84` |
| **x402Gateway** | `0x3F13150Af381BE0Aa484630Bf72Ccf3cfAC4089A` |
| **IdentityRegistry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| **AgentAccountFactory** | `0x8B4294B349530d03Fe94C216fc771206637AFDa9` |
| **AgentPoolFactory** | `0xcB016c9DC6c9bE4D6AaE84405B2686569F9cEc05` |
| **EntryPoint (v0.6)** | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| **Block Explorer** | `https://sepolia.basescan.org` |

---

## Best Practices

1. **Register first** -- all payment tools require registration.
2. **Use `pragma-agent call` for the common case** -- it handles the full approve-pay-call flow.
3. **Pull only what you need from the pool** -- respect daily caps.
4. **All gas is sponsored** -- you never need ETH for operations post-registration.
5. **Handle errors gracefully** -- if a call fails, check wallet state and retry.
6. **Cache service details** -- remember serviceIds and pricing to avoid re-querying.
