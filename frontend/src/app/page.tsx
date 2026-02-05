import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-lobster text-white">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        {/* Scattered mascots */}
        <div className="absolute right-12 top-16 pointer-events-none hidden lg:block rotate-12 drop-shadow-lg">
          <Image src="/picture.png" alt="" width={100} height={100} priority />
        </div>
        <div className="absolute right-48 bottom-20 pointer-events-none hidden lg:block -rotate-6 drop-shadow-lg">
          <Image src="/picture.png" alt="" width={72} height={72} priority />
        </div>
        <div className="absolute right-[30%] top-12 pointer-events-none hidden xl:block rotate-[-15deg] drop-shadow-lg">
          <Image src="/picture.png" alt="" width={56} height={56} />
        </div>
        <div className="absolute left-[60%] bottom-10 pointer-events-none hidden lg:block rotate-[20deg] drop-shadow-lg">
          <Image src="/picture.png" alt="" width={64} height={64} />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 py-32 lg:py-48">
          <div className="max-w-4xl">
            <h1 className="font-display text-6xl sm:text-7xl lg:text-8xl font-bold mb-8 tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-1000">
              PragmaMoney
            </h1>
            <p className="text-2xl sm:text-3xl lg:text-4xl mb-12 opacity-95 font-light leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-100">
              Payment infrastructure for autonomous AI agents
            </p>
            <p className="text-lg sm:text-xl mb-16 opacity-90 max-w-2xl leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
              x402 protocol on Base. Constrained wallets with spending policies. Instant USDC settlements.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
              <Link
                href="/marketplace"
                className="inline-flex items-center justify-center gap-3 bg-white text-lobster-primary px-10 py-5 rounded-xl font-semibold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-200 ease-in-out"
              >
                <span>Explore Marketplace</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-3 bg-transparent border-2 border-white text-white px-10 py-5 rounded-xl font-semibold text-lg hover:bg-white/10 transition-all duration-200 ease-in-out"
              >
                <span>Register a Service</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-32 bg-white">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div>
              <h2 className="font-display text-5xl sm:text-6xl font-bold text-lobster-dark mb-8 leading-tight">
                Built for the agent economy
              </h2>
              <p className="text-xl text-lobster-text leading-relaxed mb-8">
                AI agents need to transact with each other and with services. PragmaMoney provides the payment rails.
              </p>
              <p className="text-xl text-lobster-text leading-relaxed">
                Register your API, set your price, and start earning. No invoices. No delays. Just automatic payments via x402.
              </p>
            </div>
            <div className="space-y-10">
              <div className="border-l-4 border-lobster-primary pl-8">
                <h3 className="font-display text-2xl font-bold text-lobster-dark mb-3">
                  Instant settlements
                </h3>
                <p className="text-lg text-lobster-text leading-relaxed">
                  Payments settle on-chain in real-time. USDC transfers happen automatically with every API call.
                </p>
              </div>
              <div className="border-l-4 border-lobster-primary pl-8">
                <h3 className="font-display text-2xl font-bold text-lobster-dark mb-3">
                  Constrained wallets
                </h3>
                <p className="text-lg text-lobster-text leading-relaxed">
                  ERC-4337 smart accounts with spending policies. Set daily limits, approved targets, and token allowances.
                </p>
              </div>
              <div className="border-l-4 border-lobster-primary pl-8">
                <h3 className="font-display text-2xl font-bold text-lobster-dark mb-3">
                  Base blockchain
                </h3>
                <p className="text-lg text-lobster-text leading-relaxed">
                  Fast, cheap transactions with native x402 support. Built on Coinbase's Layer 2.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-32 bg-lobster-bg">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center mb-20">
            <h2 className="font-display text-5xl sm:text-6xl font-bold text-lobster-dark mb-6">
              How it works
            </h2>
            <p className="text-xl text-lobster-text max-w-2xl mx-auto leading-relaxed">
              Three steps to start earning or spending in the agent economy
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="bg-white rounded-2xl p-10 hover:shadow-xl transition-all duration-200 ease-in-out">
              <div className="flex items-center justify-center w-14 h-14 bg-gradient-lobster rounded-xl mb-8">
                <span className="material-icons text-4xl text-white">app_registration</span>
              </div>
              <div className="text-6xl font-display font-bold text-lobster-border mb-6">01</div>
              <h3 className="font-display text-2xl font-bold text-lobster-dark mb-4">
                Register your service
              </h3>
              <p className="text-lg text-lobster-text leading-relaxed">
                Set your price per call and endpoint. Deploy to the ServiceRegistry contract on Base Sepolia.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-10 hover:shadow-xl transition-all duration-200 ease-in-out">
              <div className="flex items-center justify-center w-14 h-14 bg-gradient-lobster rounded-xl mb-8">
                <span className="material-icons text-4xl text-white">sync_alt</span>
              </div>
              <div className="text-6xl font-display font-bold text-lobster-border mb-6">02</div>
              <h3 className="font-display text-2xl font-bold text-lobster-dark mb-4">
                Payments flow automatically
              </h3>
              <p className="text-lg text-lobster-text leading-relaxed">
                The x402 protocol handles everything. Callers pay with signed messages. No manual invoicing.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-10 hover:shadow-xl transition-all duration-200 ease-in-out">
              <div className="flex items-center justify-center w-14 h-14 bg-gradient-lobster rounded-xl mb-8">
                <span className="material-icons text-4xl text-white">account_balance_wallet</span>
              </div>
              <div className="text-6xl font-display font-bold text-lobster-border mb-6">03</div>
              <h3 className="font-display text-2xl font-bold text-lobster-dark mb-4">
                Receive USDC instantly
              </h3>
              <p className="text-lg text-lobster-text leading-relaxed">
                Track earnings in real-time on your dashboard. On-chain transparency with every transaction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 bg-white">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="text-center mb-20">
            <h2 className="font-display text-5xl sm:text-6xl font-bold text-lobster-dark mb-6">
              Platform features
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <span className="material-icons text-5xl text-lobster-primary">security</span>
              <h3 className="font-display text-3xl font-bold text-lobster-dark">
                Spending policies
              </h3>
              <p className="text-lg text-lobster-text leading-relaxed">
                Agent wallets with programmable constraints. Define daily spend limits, approved targets, and allowed tokens. Safe autonomous spending enforced at the smart contract level.
              </p>
            </div>

            <div className="space-y-6">
              <span className="material-icons text-5xl text-lobster-primary">inventory_2</span>
              <h3 className="font-display text-3xl font-bold text-lobster-dark">
                ERC-4626 agent pools
              </h3>
              <p className="text-lg text-lobster-text leading-relaxed">
                Investors fund agent operations through tokenized vaults. Daily withdrawal caps and vesting schedules protect capital. Agents spend from the pool with policy enforcement.
              </p>
            </div>

            <div className="space-y-6">
              <span className="material-icons text-5xl text-lobster-primary">api</span>
              <h3 className="font-display text-3xl font-bold text-lobster-dark">
                Service registry
              </h3>
              <p className="text-lg text-lobster-text leading-relaxed">
                On-chain directory of APIs, compute resources, storage, and AI agents. Register any service type with custom pricing. Usage tracking and revenue analytics built in.
              </p>
            </div>

            <div className="space-y-6">
              <span className="material-icons text-5xl text-lobster-primary">verified_user</span>
              <h3 className="font-display text-3xl font-bold text-lobster-dark">
                ERC-4337 compatible
              </h3>
              <p className="text-lg text-lobster-text leading-relaxed">
                Account abstraction for smart contract wallets. Gasless transactions via paymasters. Programmable spending rules enforced during UserOp validation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Protocol Details */}
      <section className="py-32 bg-lobster-dark text-white">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
          <div className="max-w-4xl">
            <h2 className="font-display text-5xl sm:text-6xl font-bold mb-8 leading-tight">
              Two payment directions
            </h2>
            <div className="space-y-8 text-lg leading-relaxed opacity-90">
              <p>
                <span className="font-bold text-lobster-secondary">Inbound payments:</span> End users or other agents pay your service via x402 protocol. Signed EIP-3009 messages enable gasless USDC transfers. The proxy verifies payment and returns your API response.
              </p>
              <p>
                <span className="font-bold text-lobster-secondary">Outbound payments:</span> Your agent spends from its constrained wallet. UserOps go through EntryPoint validation where spending policies are enforced. The gateway handles on-chain settlement and provides a paymentId for the downstream service.
              </p>
              <p>
                <span className="font-bold text-lobster-secondary">Agent-to-agent:</span> One agent's outbound payment becomes another agent's inbound revenue. The gateway and x402 proxy work together to route USDC and verify both sides of the transaction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 bg-gradient-lobster text-white">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-12 text-center">
          <h2 className="font-display text-5xl sm:text-6xl font-bold mb-8 leading-tight">
            Ready to start building?
          </h2>
          <p className="text-xl sm:text-2xl mb-12 opacity-95 leading-relaxed">
            Register a service, create a constrained wallet, or explore the marketplace.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center gap-3 bg-white text-lobster-primary px-10 py-5 rounded-xl font-semibold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-200 ease-in-out"
            >
              <span>Explore Marketplace</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/playground"
              className="inline-flex items-center justify-center gap-3 bg-transparent border-2 border-white text-white px-10 py-5 rounded-xl font-semibold text-lg hover:bg-white/10 transition-all duration-200 ease-in-out"
            >
              <span>Try the Playground</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
