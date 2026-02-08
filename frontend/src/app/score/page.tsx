"use client";

import { useMemo, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Address } from "viem";
import { SCORE_ORACLE_ADDRESS } from "@/lib/contracts";

const SCORE_ORACLE_ABI = [
  {
    type: "function",
    name: "calculateScore",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "tag1s", type: "string[]" },
      { name: "tag2s", type: "string[]" },
      { name: "weightsBps", type: "int32[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

export default function ScorePage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [agentId, setAgentId] = useState("");
  const [tag1s, setTag1s] = useState("");
  const [tag2s, setTag2s] = useState("");
  const [weights, setWeights] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  const parsed = useMemo(() => {
    const tag1List = tag1s
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const tag2List = tag2s
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const weightList = weights
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => Number(item));

    return { tag1List, tag2List, weightList };
  }, [tag1s, tag2s, weights]);

  const handleSubmit = async () => {
    setError(null);

    if (!isConnected || !address) {
      setError("Connect your wallet first.");
      return;
    }
    if (!agentId.trim()) {
      setError("Agent ID is required.");
      return;
    }

    const { tag1List, tag2List, weightList } = parsed;
    if (tag1List.length === 0) {
      setError("Provide at least one tag pair.");
      return;
    }
    if (tag2List.length > 0 && tag2List.length > tag1List.length) {
      setError("tag2s cannot be longer than tag1s.");
      return;
    }
    if (tag1List.length !== weightList.length) {
      setError("tag1s and weights must have the same length.");
      return;
    }
    if (weightList.some((value) => Number.isNaN(value))) {
      setError("Weights must be valid numbers.");
      return;
    }
    if (weightList.some((value) => value < INT32_MIN || value > INT32_MAX)) {
      setError("Weights must fit within int32 range.");
      return;
    }

    const resolvedTag2s =
      tag2List.length === 0
        ? tag1List.map(() => "")
        : [...tag2List, ...new Array(tag1List.length - tag2List.length).fill("")];

    try {
      const hash = await writeContractAsync({
        address: SCORE_ORACLE_ADDRESS as Address,
        abi: SCORE_ORACLE_ABI,
        functionName: "calculateScore",
        args: [BigInt(agentId), tag1List, resolvedTag2s, weightList],
      });
      setTxHash(hash);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  };

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="card p-8">
          <h1 className="text-3xl font-display font-bold text-lobster-dark mb-4">
            Score Oracle
          </h1>
          <p className="text-lobster-text mb-6">
            Call <span className="font-semibold">calculateScore</span> on the
            ScoreOracle to update an agent’s score and pool cap based on tags and
            weights.
          </p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-lobster-dark mb-2">
                Agent ID
              </label>
              <input
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                placeholder="e.g. 1"
                className="w-full px-4 py-3 rounded-xl border border-lobster-border focus:outline-none focus:ring-2 focus:ring-lobster-primary/30"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-lobster-dark mb-2">
                tag1s (comma-separated)
              </label>
              <input
                value={tag1s}
                onChange={(event) => setTag1s(event.target.value)}
                placeholder="performance, latency"
                className="w-full px-4 py-3 rounded-xl border border-lobster-border focus:outline-none focus:ring-2 focus:ring-lobster-primary/30"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-lobster-dark mb-2">
                tag2s (comma-separated, optional)
              </label>
              <input
                value={tag2s}
                onChange={(event) => setTag2s(event.target.value)}
                placeholder="uptime, response"
                className="w-full px-4 py-3 rounded-xl border border-lobster-border focus:outline-none focus:ring-2 focus:ring-lobster-primary/30"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-lobster-dark mb-2">
                weightsBps (comma-separated, signed)
              </label>
              <input
                value={weights}
                onChange={(event) => setWeights(event.target.value)}
                placeholder="10000, -5000"
                className="w-full px-4 py-3 rounded-xl border border-lobster-border focus:outline-none focus:ring-2 focus:ring-lobster-primary/30"
              />
              <p className="text-xs text-lobster-text mt-2">
                Use basis points (10,000 = 1.0x). Negative values mean lower is better.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {txHash && (
            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-700 text-sm">
              Submitted tx: {txHash}
            </div>
          )}

          {receipt?.status === "success" && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-700 text-sm">
              Score updated successfully.
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isConfirming}
            className="mt-8 w-full bg-lobster-primary text-white rounded-xl py-3 font-semibold hover:bg-lobster-hover transition-colors duration-200 disabled:opacity-70"
          >
            {isConfirming ? "Submitting..." : "Calculate Score"}
          </button>
        </div>
      </div>
    </div>
  );
}
