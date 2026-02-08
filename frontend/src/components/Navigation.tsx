"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "./ConnectWallet";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/playground", label: "Playground" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/register", label: "Register" },
  { href: "/score", label: "Score" },
];

export function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-black/50 backdrop-blur-lg border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center space-x-2 text-2xl font-display font-bold text-white hover:text-pragma-primary transition-colors duration-200"
          >
            <span className="material-icons text-3xl">account_balance_wallet</span>
            <span>PragmaMoney</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-all duration-200",
                  pathname === link.href || pathname.startsWith(link.href + "/")
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-lobster-hover hover:text-white"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop Connect Wallet */}
          <div className="hidden md:block">
            <ConnectWallet />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-lobster-hover transition-colors duration-200"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-white" />
            ) : (
              <Menu className="w-6 h-6 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-black/90 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "block px-4 py-3 rounded-xl font-medium transition-all duration-200",
                  pathname === link.href || pathname.startsWith(link.href + "/")
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-lobster-hover hover:text-white"
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 border-t border-white/10">
              <ConnectWallet />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
