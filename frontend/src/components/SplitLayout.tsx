"use client";

import { ReactNode } from "react";
import AsciiSphere from "./AsciiSphere";

interface SplitLayoutProps {
    children: ReactNode;
}

export default function SplitLayout({ children }: SplitLayoutProps) {
    return (
        <div className="flex flex-col lg:flex-row min-h-screen bg-pragma-dark text-white">
            {/* Left Column: Primary Content (60%) */}
            <div className="w-full lg:w-[60%] flex flex-col relative z-10 bg-pragma-dark border-r border-white/10">
                <main className="flex-1">
                    {children}
                </main>
            </div>

            {/* Right Column: Data Stream (40%) */}
            <div className="hidden lg:block lg:w-[40%] fixed right-0 top-0 bottom-0 z-0 bg-black">
                <AsciiSphere />
                {/* Overlay a subtle gradient to blend the edges */}
                <div className="absolute inset-0 bg-gradient-to-l from-transparent to-pragma-dark/20 pointer-events-none" />
            </div>
        </div>
    );
}
