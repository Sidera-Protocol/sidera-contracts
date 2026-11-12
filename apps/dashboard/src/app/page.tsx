"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, Globe, ShieldCheck, Zap } from "lucide-react";
import Navbar, { type NetworkChoice } from "@/components/Navbar";
import SearchBar from "@/components/SearchBar";
import DomainCard from "@/components/DomainCard";
import RegisterModal, { type RegisterTarget } from "@/components/RegisterModal";
import { DEMO_MODE, lookupName, type LookupResult } from "@/lib/sidera";

function AvailabilityPanel({ result, onClaim }: { result: Extract<LookupResult, { status: "available" }>; onClaim: () => void }) {
  return (
    <div className="rounded-2xl border border-star-500/30 bg-star-500/5 p-6 text-center">
      <p className="font-mono text-2xl font-semibold text-white">{result.fullName}</p>
      <p className="mt-1 text-sm text-emerald-400">available to claim</p>
      <button
        onClick={onClaim}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-star-600 px-6 py-3 font-medium text-white hover:bg-star-500"
      >
        Claim this name <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function InvalidPanel({ result }: { result: Extract<LookupResult, { status: "invalid" }> }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
      <p className="font-mono text-xl text-white">{result.name}</p>
      <p className="mt-1 text-sm text-red-400">invalid name — {result.reason}</p>
    </div>
  );
}

export default function HomePage() {
  const [network, setNetwork] = useState<NetworkChoice>("testnet");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [claimTarget, setClaimTarget] = useState<RegisterTarget | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      setResult(await lookupName(query));
    } catch {
      setResult({ status: "invalid", name: query, reason: "lookup failed, try again" });
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="min-h-screen">
      <Navbar network={network} onNetworkChange={setNetwork} />

      <main className="mx-auto max-w-3xl px-4 pb-24">
        {/* Hero */}
        <section className="pb-10 pt-20 text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-space-800 bg-space-900 px-3 py-1 text-xs text-gray-400">
            <Globe className="h-3.5 w-3.5 text-star-400" aria-hidden />
            {DEMO_MODE ? "demo mode — mock registry" : "live registry"} · {network}
          </p>
          <h1 className="text-balance text-5xl font-bold tracking-tight text-white">
            Send payments to <span className="text-star-400">alice.sid</span>,
            <br />
            not to a checksum.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-400">
            Human-readable names for Stellar addresses — with memo hints so
            exchange payments never get lost.
          </p>
        </section>

        <SearchBar value={query} onChange={setQuery} onSubmit={runSearch} loading={loading} />

        {/* Results */}
        <section className="mt-8 space-y-6" aria-live="polite">
          {result?.status === "found" && <DomainCard record={result.record} />}
          {result?.status === "available" && (
            <AvailabilityPanel
              result={result}
              onClaim={() => setClaimTarget({ name: result.name, fullName: result.fullName })}
            />
          )}
          {result?.status === "invalid" && <InvalidPanel result={result} />}
        </section>

        {/* Value props */}
        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Zap, title: "One lookup", body: "Name → address + memo in a single resolution call." },
            { icon: ShieldCheck, title: "Memo safety", body: "Exchange memo hints travel with the name — no more lost deposits." },
            { icon: Globe, title: "Wallet-ready", body: "A resolver interface any Stellar wallet can implement." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-space-800 bg-space-900 p-5">
              <Icon className="mb-3 h-5 w-5 text-star-400" aria-hidden />
              <h3 className="font-medium text-white">{title}</h3>
              <p className="mt-1 text-sm text-gray-400">{body}</p>
            </div>
          ))}
        </section>

        <p className="mt-12 text-center text-sm text-gray-500">
          Own names already?{" "}
          <Link href="/dashboard" className="text-star-400 hover:underline">
            Open your dashboard →
          </Link>
        </p>
      </main>

      {claimTarget && (
        <RegisterModal
          target={claimTarget}
          onClose={() => setClaimTarget(null)}
          onRegistered={(name) => {
            // In demo mode mark the name taken for the session.
            setClaimTarget(null);
            void runSearchByName(name);
          }}
        />
      )}
    </div>
  );

  async function runSearchByName(name: string) {
    setLoading(true);
    try {
      setResult(await lookupName(name));
    } finally {
      setLoading(false);
    }
  }
}
