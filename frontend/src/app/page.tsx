"use client";

import Link from "next/link";
import { ArrowRight, Box, CheckCircle, Layers, Shield, Terminal, Zap } from "lucide-react";
import SplitLayout from "@/components/SplitLayout";
import TopographicFooter from "@/components/TopographicFooter";

export default function HomePage() {
  return (
    <SplitLayout>
      <div className="px-6 py-20 lg:p-24 selection:bg-pragma-primary selection:text-white">

        {/* HERO SECTION */}
        <section className="mb-40">
          <div className="inline-flex items-center gap-2 mb-12 border-b border-pragma-primary/20 pb-2">
            <span className="w-2 h-2 bg-pragma-primary animate-pulse" />
            <span className="font-mono text-sm tracking-widest text-pragma-primary uppercase">Agent Economy Live</span>
          </div>

          <h1 className="font-sans text-7xl sm:text-8xl lg:text-9xl font-bold tracking-tighter leading-[0.85] mb-12 text-white">
            PRAGMA<br />
            <span className="text-pragma-primary">MONEY</span>
          </h1>

          <p className="font-mono text-lg text-white/60 max-w-xl leading-relaxed mb-16">
            // PAYMENT INFRASTRUCTURE FOR AUTONOMOUS AI AGENTS.<br />
            // X402 PROTOCOL ON BASE.<br />
            // CONSTRAINED WALLETS & INSTANT SETTLEMENT.
          </p>

          <div className="flex flex-col sm:flex-row gap-6">
            <Link href="/marketplace" className="group flex items-center gap-4 text-2xl font-bold text-white hover:text-pragma-primary transition-colors">
              [ EXPLORE MARKETPLACE ]
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
            </Link>
          </div>
        </section>

        {/* LOGO GRID */}
        <section className="mb-40 border-y border-white/10 py-12">
          <p className="font-mono text-xs text-white/40 mb-8 uppercase tracking-widest">Trusted Infrastructure</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Placeholders for logos, using text for now as per "Typography" constraint, but styled as logos */}
            {["BASE", "COINBASE", "OPENAI", "ETHEREUM"].map((logo) => (
              <div key={logo} className="h-12 flex items-center justify-start text-xl font-bold font-sans tracking-tight text-white">{logo}</div>
            ))}
          </div>
        </section>

        {/* VALUE PROPOSITION: HIGH PERFORMANCE DATA */}
        <section className="mb-40">
          <h2 className="font-sans text-5xl font-bold mb-20 tracking-tighter">
            INFRASTRUCTURE <br />
            <span className="text-white/40">FOR MACHINES.</span>
          </h2>

          <div className="space-y-0">
            {[
              { id: "01", title: "Instant Settlements", desc: "Payments settle on-chain in real-time. USDC transfers happen automatically with every API call." },
              { id: "02", title: "Constrained Wallets", desc: "ERC-4337 smart accounts with spending policies. Set daily limits, approved targets, and allowances." },
              { id: "03", title: "Base Blockchain", desc: "Fast, cheap transactions with native x402 support. Built on Coinbase's L2." }
            ].map((item) => (
              <div key={item.id} className="group border-t border-white/10 py-12 flex flex-col md:flex-row gap-8 md:gap-20 hover:bg-white/5 transition-colors px-4 -mx-4">
                <span className="font-mono text-pragma-primary text-xl">{item.id}</span>
                <div className="flex-1">
                  <h3 className="font-sans text-3xl font-bold mb-4">{item.title}</h3>
                  <p className="font-mono text-white/60 leading-relaxed max-w-md">{item.desc}</p>
                </div>
                <ArrowRight className="w-8 h-8 opacity-0 group-hover:opacity-100 -rotate-45 group-hover:rotate-0 transition-all" />
              </div>
            ))}
          </div>
          <div className="border-t border-white/10" />
        </section>

        {/* HOW IT WORKS */}
        <section className="mb-40">
          <div className="flex items-end justify-between mb-20">
            <h2 className="font-sans text-5xl font-bold tracking-tighter">PROTOCOL <br /> FLOW</h2>
            <div className="hidden md:block font-mono text-xs text-right text-white/40">
              SYNC_STATUS: ACTIVE<br />
              LATENCY: 12ms
            </div>
          </div>

          <div className="grid gap-12">
            {[
              { step: "01", label: "REGISTER", text: "Set price per call. Deploy to ServiceRegistry on Base Sepolia." },
              { step: "02", label: "AUTOMATE", text: "x402 protocol handles signing. No manual invoicing. Pure machine-to-machine." },
              { step: "03", label: "RECEIVE", text: "Real-time USDC settlement. Transparent on-chain reporting." }
            ].map((item) => (
              <div key={item.step} className="relative pl-12 border-l border-white/10 py-4">
                <div className="absolute left-[-5px] top-4 w-2.5 h-2.5 bg-pragma-dark border border-pragma-primary rounded-full" />
                <div className="mb-2 font-mono text-pragma-primary text-sm tracking-widest">{item.step} // {item.label}</div>
                <p className="font-sans text-3xl font-medium leading-tight">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PLATFORM FEATURES */}
        <section className="mb-40">
          <h2 className="font-sans text-5xl font-bold mb-16 tracking-tighter text-right">
            SYSTEM <br /> CAPABILITIES
          </h2>

          <div className="grid md:grid-cols-2 gap-x-12 gap-y-24">
            {[
              { icon: Shield, title: "Spending Policies", desc: "Programmable constraints. Define daily limits and allowed tokens." },
              { icon: Layers, title: "Agent Pools", desc: "Tokenized vaults for investor funding with vesting schedules." },
              { icon: Terminal, title: "Service Registry", desc: "On-chain directory of APIs and compute resources." },
              { icon: CheckCircle, title: "ERC-4337", desc: "Account abstraction with gasless Paymaster flows." }
            ].map((feature, i) => (
              <div key={i}>
                <feature.icon className="w-12 h-12 text-pragma-primary mb-8" strokeWidth={1} />
                <h3 className="font-mono text-xl font-bold mb-4 uppercase">{feature.title}</h3>
                <p className="text-white/60 leading-relaxed font-mono text-sm border-l-2 border-white/10 pl-4">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* PROTOCOL DETAILS (TEXT BLOCK) */}
        <section className="mb-20">
          <div className="bg-white/5 p-8 md:p-12 border border-white/10">
            <h3 className="font-mono text-pragma-primary mb-8 text-sm uppercase tracking-widest">Transaction Routing</h3>
            <div className="space-y-8">
              <div>
                <h4 className="font-sans text-2xl font-bold mb-2">Inbound</h4>
                <p className="text-white/60 font-mono text-sm">End users pay via x402. Signed EIP-3009 messages enable gasless USDC transfers.</p>
              </div>
              <div>
                <h4 className="font-sans text-2xl font-bold mb-2">Outbound</h4>
                <p className="text-white/60 font-mono text-sm">Agent spends from constrained wallet. UserOps validated by EntryPoint.</p>
              </div>
              <div>
                <h4 className="font-sans text-2xl font-bold mb-2">Agent-to-Agent</h4>
                <p className="text-white/60 font-mono text-sm">Seamless routing. One agent's payment is another's revenue.</p>
              </div>
            </div>
          </div>
        </section>

      </div>

      <TopographicFooter />
    </SplitLayout>
  );
}


