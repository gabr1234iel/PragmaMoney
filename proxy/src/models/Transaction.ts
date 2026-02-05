import { randomUUID } from "node:crypto";
import type {
  Transaction,
  PaymentMethod,
  TransactionStatus,
} from "../types/x402.js";

/**
 * Create a new Transaction audit record.
 */
export function createTransaction(params: {
  resourceId: string;
  payer: string;
  amount: string;
  method: PaymentMethod;
  status?: TransactionStatus;
  paymentId?: string;
}): Transaction {
  return {
    id: randomUUID(),
    resourceId: params.resourceId,
    payer: params.payer,
    amount: params.amount,
    method: params.method,
    timestamp: Date.now(),
    status: params.status ?? "pending",
    paymentId: params.paymentId,
  };
}

/** Track used paymentIds to prevent replay attacks. */
const usedPaymentIds = new Set<string>();

export function isPaymentIdUsed(id: string): boolean {
  return usedPaymentIds.has(id);
}

export function markPaymentIdUsed(id: string): void {
  usedPaymentIds.add(id);
}

/** Simple in-memory transaction log. */
const transactions: Transaction[] = [];

export function recordTransaction(tx: Transaction): void {
  transactions.push(tx);
}

export function getTransactions(): ReadonlyArray<Transaction> {
  return transactions;
}

export function getTransactionsByResource(
  resourceId: string
): ReadonlyArray<Transaction> {
  return transactions.filter((tx) => tx.resourceId === resourceId);
}
