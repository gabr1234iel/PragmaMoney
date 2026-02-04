import Link from "next/link";
import {
  ArrowRight,
  Wallet,
  Zap,
  DollarSign,
  Shield,
  Globe,
  TrendingUp,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-lobster text-white">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              PragmaMoney
            </h1>
            <p className="text-xl sm:text-2xl mb-8 opacity-95 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-100">
              x402 Payment Gateway for AI Agents
            </p>
            <p className="text-lg mb-12 opacity-90 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
              Decentralized payment infrastructure enabling seamless microtransactions
              between AI agents and services on Base blockchain
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
              <Link
                href="/marketplace"
                className="inline-flex items-center justify-center space-x-2 bg-white text-lobster-primary px-8 py-4 rounded-xl font-semibold hover:shadow-2xl hover:scale-105 transition-all duration-200"
              >
                <span>Get Started</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center space-x-2 bg-transparent border-2 border-white text-white px-8 py-4 rounded-xl font-semibold hover:bg-white/10 transition-all duration-200"
              >
                <span>Register Service</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-lobster-dark mb-4">
              How It Works
            </h2>
            <p className="text-lg text-lobster-text max-w-2xl mx-auto">
              Three simple steps to start earning or spending with the x402 protocol
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="card-hover text-center">
              <div className="w-16 h-16 bg-gradient-lobster rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Wallet className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-display text-2xl font-bold text-lobster-dark mb-4">
                1. Register
              </h3>
              <p className="text-lobster-text">
                Register your API or service with custom pricing. Set your price per
                call and start earning USDC.
              </p>
            </div>

            {/* Step 2 */}
            <div className="card-hover text-center">
              <div className="w-16 h-16 bg-gradient-lobster rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-display text-2xl font-bold text-lobster-dark mb-4">
                2. Pay
              </h3>
              <p className="text-lobster-text">
                The x402 protocol handles automatic payments. No manual invoicing, no
                delays. Just seamless transactions.
              </p>
            </div>

            {/* Step 3 */}
            <div className="card-hover text-center">
              <div className="w-16 h-16 bg-gradient-lobster rounded-2xl flex items-center justify-center mx-auto mb-6">
                <DollarSign className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-display text-2xl font-bold text-lobster-dark mb-4">
                3. Earn
              </h3>
              <p className="text-lobster-text">
                Receive USDC instantly for every API call. Track your earnings in
                real-time on the dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-lobster-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-lobster-dark mb-4">
              Why PragmaMoney?
            </h2>
            <p className="text-lg text-lobster-text max-w-2xl mx-auto">
              Built for the future of autonomous AI agent economies
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="card">
              <Shield className="w-10 h-10 text-lobster-primary mb-4" />
              <h3 className="font-display text-xl font-bold text-lobster-dark mb-3">
                Spending Policies
              </h3>
              <p className="text-lobster-text">
                Constrained wallets with daily limits and approved targets ensure safe
                autonomous spending.
              </p>
            </div>

            <div className="card">
              <Globe className="w-10 h-10 text-lobster-primary mb-4" />
              <h3 className="font-display text-xl font-bold text-lobster-dark mb-3">
                Base Blockchain
              </h3>
              <p className="text-lobster-text">
                Built on Base for fast, cheap transactions with native x402 protocol
                support.
              </p>
            </div>

            <div className="card">
              <TrendingUp className="w-10 h-10 text-lobster-primary mb-4" />
              <h3 className="font-display text-xl font-bold text-lobster-dark mb-3">
                Real-time Analytics
              </h3>
              <p className="text-lobster-text">
                Track service usage, revenue, and transaction history with
                comprehensive dashboards.
              </p>
            </div>

            <div className="card">
              <Zap className="w-10 h-10 text-lobster-primary mb-4" />
              <h3 className="font-display text-xl font-bold text-lobster-dark mb-3">
                Instant Payments
              </h3>
              <p className="text-lobster-text">
                No delays, no intermediaries. Payments settle instantly on-chain with
                full transparency.
              </p>
            </div>

            <div className="card">
              <span className="material-icons text-5xl text-lobster-primary mb-4">
                api
              </span>
              <h3 className="font-display text-xl font-bold text-lobster-dark mb-3">
                Any Service Type
              </h3>
              <p className="text-lobster-text">
                Support for compute, storage, APIs, AI agents, and custom service
                types.
              </p>
            </div>

            <div className="card">
              <span className="material-icons text-5xl text-lobster-primary mb-4">
                verified_user
              </span>
              <h3 className="font-display text-xl font-bold text-lobster-dark mb-3">
                ERC-4337 Compatible
              </h3>
              <p className="text-lobster-text">
                Account abstraction for smart contract wallets with programmable
                spending rules.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <p className="font-display text-5xl font-bold text-lobster-primary mb-2">
                100+
              </p>
              <p className="text-lobster-text font-medium">Registered Services</p>
            </div>
            <div className="text-center">
              <p className="font-display text-5xl font-bold text-lobster-primary mb-2">
                10K+
              </p>
              <p className="text-lobster-text font-medium">Total Payments</p>
            </div>
            <div className="text-center">
              <p className="font-display text-5xl font-bold text-lobster-primary mb-2">
                $250K
              </p>
              <p className="text-lobster-text font-medium">Volume Processed</p>
            </div>
            <div className="text-center">
              <p className="font-display text-5xl font-bold text-lobster-primary mb-2">
                500+
              </p>
              <p className="text-lobster-text font-medium">Active Agents</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-lobster text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-display text-4xl sm:text-5xl font-bold mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl mb-8 opacity-95">
            Join the future of autonomous AI agent payments on Base
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center space-x-2 bg-white text-lobster-primary px-8 py-4 rounded-xl font-semibold hover:shadow-2xl hover:scale-105 transition-all duration-200"
          >
            <span>Explore Marketplace</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
