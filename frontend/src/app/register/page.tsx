"use client";

import Link from "next/link";
import { Server, Bot } from "lucide-react";

export default function RegisterHubPage() {
  return (
    <div className="min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h1 className="font-display text-5xl font-bold text-lobster-dark mb-4">
            Register
          </h1>
          <p className="text-xl text-lobster-text max-w-2xl mx-auto">
            Register a service to earn USDC or deploy an agent with a constrained smart wallet
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <Link href="/register/service" className="group">
            <div className="card-hover h-full flex flex-col items-center text-center p-8">
              <div className="w-20 h-20 bg-lobster-surface rounded-2xl flex items-center justify-center mb-6 group-hover:bg-lobster-primary/10 transition-colors duration-200">
                <Server className="w-10 h-10 text-lobster-primary" />
              </div>
              <h2 className="font-display text-2xl font-bold text-lobster-dark mb-3">
                Register Service
              </h2>
              <p className="text-lobster-text mb-4 flex-1">
                List your API or service on PragmaMoney. Users pay per call via x402 or the on-chain gateway.
              </p>
              <span className="text-lobster-primary font-semibold group-hover:underline">
                Get started
              </span>
            </div>
          </Link>

          <Link href="/register/agent" className="group">
            <div className="card-hover h-full flex flex-col items-center text-center p-8">
              <div className="w-20 h-20 bg-lobster-surface rounded-2xl flex items-center justify-center mb-6 group-hover:bg-lobster-primary/10 transition-colors duration-200">
                <Bot className="w-10 h-10 text-lobster-primary" />
              </div>
              <h2 className="font-display text-2xl font-bold text-lobster-dark mb-3">
                Register Agent
              </h2>
              <p className="text-lobster-text mb-4 flex-1">
                Deploy an AI agent with an ERC-4337 smart wallet, spending policies, and on-chain identity.
              </p>
              <span className="text-lobster-primary font-semibold group-hover:underline">
                Get started
              </span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
