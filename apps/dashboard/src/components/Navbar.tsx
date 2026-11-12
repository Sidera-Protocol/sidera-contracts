"use client";

import { useState } from "react";
import Link from "next/link";
import { Stars, Wallet, LogOut, Loader2, AlertCircle } from "lucide-react";
import { useWallet } from "@/lib/useWallet";

const NETWORKS = ["testnet", "futurenet", "local"] as const;
export type NetworkChoice = (typeof NETWORKS)[number];

function shorten(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function Navbar({
  network,
  onNetworkChange,
}: {
  network: NetworkChoice;
  onNetworkChange: (n: NetworkChoice) => void;
}) {
  const wallet = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-space-800 bg-space-950/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Stars className="h-6 w-6 text-star-400" aria-hidden />
          <span className="text-lg font-semibold tracking-tight text-white">
            Sidera
            <span className="text-star-400">.sid</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {/* Network selector */}
          <label className="sr-only" htmlFor="network-select">
            Network
          </label>
          <select
            id="network-select"
            value={network}
            onChange={(e) => onNetworkChange(e.target.value as NetworkChoice)}
            className="rounded-lg border border-space-800 bg-space-900 px-3 py-1.5 text-sm text-gray-300 focus:border-star-500 focus:outline-none"
          >
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n === "local" ? "local rpc" : n}
              </option>
            ))}
          </select>

          {/* Wallet */}
          {!wallet.ready ? (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-space-800" aria-hidden />
          ) : wallet.connected ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-space-800 bg-space-900 px-3 py-1.5 text-sm text-gray-200 hover:border-star-500"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                {wallet.address ? shorten(wallet.address) : "wallet"}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-space-800 bg-space-900 p-1 shadow-xl">
                  <button
                    onClick={() => {
                      wallet.disconnect();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-space-800"
                  >
                    <LogOut className="h-4 w-4" aria-hidden /> Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={wallet.connect}
              disabled={wallet.connecting}
              className="flex items-center gap-2 rounded-lg bg-star-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-star-500 disabled:opacity-60"
            >
              {wallet.connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Wallet className="h-4 w-4" aria-hidden />
              )}
              Connect
            </button>
          )}
        </div>
      </div>

      {wallet.error && (
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-2 text-xs text-amber-400">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {wallet.error}
        </div>
      )}
    </header>
  );
}
