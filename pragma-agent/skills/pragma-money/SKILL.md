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

# PragmaMoney — How To Use

You have the `pragma-agent` CLI tool installed. It lets you register on-chain, check your wallet, browse services, and pay for API calls using USDC on Base Sepolia.

**IMPORTANT RULES:**
1. Always run commands exactly as shown — do NOT modify the command structure
2. Every command outputs JSON — parse the JSON to understand the result
3. If a command fails, read the error JSON and report it — do NOT retry more than once
4. The `register` command handles EVERYTHING automatically (funding, identity, wallet, pool) — just run it ONCE and wait
5. Registration takes 30-60 seconds — be patient, do NOT interrupt or re-run it

---

## Quick Reference

| What you want to do | Command |
|---------------------|---------|
| Register on PragmaMoney | `pragma-agent register --name "BotName" --endpoint "https://url" --daily-limit 100 --expiry-days 90 --pool-daily-cap 50` |
| Check if registered | `pragma-agent wallet address` |
| Check USDC balance | `pragma-agent wallet balance` |
| Check spending policy | `pragma-agent wallet policy` |
| List all services | `pragma-agent services list` |
| Get service details | `pragma-agent services get --service-id 0x...` |
| Search services | `pragma-agent services search --query "keyword"` |
| Check pool funds remaining | `pragma-agent pool remaining` |
| Pull USDC from pool | `pragma-agent pool pull --amount 5.00` |
| Pay + call a service | `pragma-agent call --service-id 0x... --method POST --body '{"key":"val"}'` |
| Pay without calling | `pragma-agent pay pay --service-id 0x... --calls 1` |
| Verify a payment | `pragma-agent pay verify --payment-id 0x...` |

---

## Step 1: Check If Already Registered

Before doing anything, always check first:

```bash
pragma-agent wallet address
```

If the output JSON has `"registered": true`, you are already registered. Skip to Step 3.

If `"registered": false`, proceed to Step 2.

---

## Step 2: Register (One-Time, Automatic)

Run this ONE command. It does everything automatically — funding, identity creation, smart wallet deployment, and pool creation. It takes 30-60 seconds. Wait for it to finish.

```bash
pragma-agent register --name "YourBotName" --endpoint "https://your-endpoint.com" --daily-limit 100 --expiry-days 90 --pool-daily-cap 50
```

**Replace** `YourBotName` with the name the user asked for, and the endpoint with what they specified. Keep `--daily-limit 100 --expiry-days 90 --pool-daily-cap 50` as defaults unless the user specified different values.

The output JSON will contain:
- `"success": true` if it worked
- `"agentId"`, `"smartAccountAddress"`, `"poolAddress"` — your on-chain identity
- `"error"` if something went wrong

**If registration fails:** Report the error to the user. Do NOT retry automatically — the user needs to check the relayer.

**If already registered:** The command returns an error saying "Agent is already registered" with your existing agentId. This is fine — you're already set up.

---

## Step 3: Check Wallet Balance

```bash
pragma-agent wallet balance
```

Shows your ETH and USDC balances. The `usdcBalance` field is your spending money.

---

## Step 4: Browse Services

```bash
pragma-agent services list
```

Returns all services from the on-chain ServiceRegistry with names, pricing, and serviceIds.

To get details on a specific service:

```bash
pragma-agent services get --service-id 0xTHE_SERVICE_ID_HERE
```

---

## Step 5: Pull Funds From Pool (If Needed)

If your USDC balance is 0 and your pool has been funded by investors:

```bash
pragma-agent pool remaining
```

If there's remaining cap, pull what you need:

```bash
pragma-agent pool pull --amount 5.00
```

---

## Step 6: Pay + Call a Service

This is the most common action. One command does payment and API call:

```bash
pragma-agent call --service-id 0xTHE_SERVICE_ID --method GET
```

For POST requests with a body:

```bash
pragma-agent call --service-id 0xTHE_SERVICE_ID --method POST --body '{"key":"value"}'
```

The output includes the API response in the `"response"` field.

---

## Error Handling

| Error in JSON | What to do |
|---------------|------------|
| `"Agent not registered"` | Run `pragma-agent register` first |
| `"Insufficient USDC balance"` | Run `pragma-agent pool pull --amount X` |
| `"Daily cap exceeded"` | Wait until tomorrow (resets at midnight UTC) |
| `"PIMLICO_API_KEY not set"` | Tell the user to set the environment variable |
| `"Fund phase failed"` | Tell the user the relayer proxy is not running |
| `"Agent is already registered"` | This is fine — you're already set up, proceed to use services |

---

## USDC Amounts

- USDC uses 6 decimals: `1000000` = 1.00 USDC
- Always use human-readable amounts in commands (e.g., `5.00`, `0.01`)
- The CLI handles decimal conversion automatically
