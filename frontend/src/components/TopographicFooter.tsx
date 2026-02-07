"use client";

import Link from "next/link";
import { ArrowRight, Box, Terminal } from "lucide-react";

const TopographicMap = () => (
    <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.005" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="20" />
        </filter>
        <path
            d="M0,50 Q200,100 400,50 T800,50 T1200,50 V100 H0 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-black"
        />
        {/* Stylized contour lines - strictly decorative */}
        <path d="M-100,200 C200,150 500,250 800,200 S1400,100 1600,200" stroke="currentColor" fill="none" strokeWidth="0.5" />
        <path d="M-100,300 C300,250 600,350 900,300 S1500,200 1700,300" stroke="currentColor" fill="none" strokeWidth="0.5" />
        <path d="M-100,400 C400,350 700,450 1000,400 S1600,300 1800,400" stroke="currentColor" fill="none" strokeWidth="0.5" />
        <path d="M-100,500 C500,450 800,550 1100,500 S1700,400 1900,500" stroke="currentColor" fill="none" strokeWidth="0.5" />
    </svg>
);

export default function TopographicFooter() {
    return (
        <section className="relative bg-[#F0F0F0] text-black py-20 lg:py-32 overflow-hidden border-t border-white/20">
            {/* Background Texture */}
            <TopographicMap />

            <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
                <h2 className="font-display text-5xl sm:text-7xl font-bold mb-16 tracking-tighter">
                    Ready to <br /><span className="text-pragma-primary">Integrate?</span>
                </h2>

                <div className="grid md:grid-cols-2 gap-8">
                    <Link href="/manual-verification/marketplace" className="group relative block p-12 bg-white rounded-none border border-black/10 hover:border-black transition-all duration-300 hover:shadow-2xl">
                        <div className="mb-8">
                            <Box className="w-12 h-12 text-pragma-primary" />
                        </div>
                        <h3 className="text-3xl font-bold mb-4 flex items-center gap-4">
                            Explore Marketplace
                            <ArrowRight className="w-6 h-6 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-300" />
                        </h3>
                        <p className="text-black/60 text-lg">Browse available agent services and AI capabilities.</p>
                    </Link>

                    <Link href="/manual-verification/register" className="group relative block p-12 bg-black text-white rounded-none border border-black hover:bg-pragma-primary hover:border-pragma-primary transition-all duration-300 hover:shadow-2xl">
                        <div className="mb-8">
                            <Terminal className="w-12 h-12 text-white" />
                        </div>
                        <h3 className="text-3xl font-bold mb-4 flex items-center gap-4">
                            Register Service
                            <ArrowRight className="w-6 h-6 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all duration-300" />
                        </h3>
                        <p className="text-white/60 text-lg group-hover:text-white/80">Deploy your API endpoints to the x402 network.</p>
                    </Link>
                </div>

                <div className="mt-20 pt-10 border-t border-black/10 flex flex-col sm:flex-row justify-between items-center opacity-60">
                    <p className="font-mono text-sm">PRAGMA::MONEY v1.0.4 [BETA]</p>
                    <div className="flex gap-6 mt-4 sm:mt-0 font-mono text-sm">
                        <Link href="#" className="hover:text-pragma-primary">DOCS</Link>
                        <Link href="#" className="hover:text-pragma-primary">GITHUB</Link>
                        <Link href="#" className="hover:text-pragma-primary">TWITTER</Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
