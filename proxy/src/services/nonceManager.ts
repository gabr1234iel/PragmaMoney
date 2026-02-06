import { JsonRpcProvider } from "ethers";

/**
 * Global in-memory nonce manager for the deployer wallet.
 *
 * Public RPCs behind load balancers return stale nonces. Instead of querying
 * getTransactionCount on each request (which races under concurrent calls),
 * we track the nonce in-memory. Initialized once from RPC, then incremented
 * synchronously via allocateNonce().
 *
 * Node.js is single-threaded so the synchronous read+increment in
 * allocateNonce() is atomic — no two callers can get the same value.
 */

let _nonce: number | null = null;
let _initPromise: Promise<void> | null = null;

export async function initDeployerNonce(provider: JsonRpcProvider, address: string): Promise<void> {
  if (_nonce !== null) return;
  if (_initPromise) { await _initPromise; return; }
  _initPromise = (async () => {
    _nonce = await provider.getTransactionCount(address, "pending");
    console.log(`[nonce-manager] Initialized deployer nonce: ${_nonce}`);
  })();
  await _initPromise;
  _initPromise = null;
}

export function allocateNonce(): number {
  if (_nonce === null) throw new Error("Deployer nonce not initialized — call initDeployerNonce first");
  return _nonce++;
}
