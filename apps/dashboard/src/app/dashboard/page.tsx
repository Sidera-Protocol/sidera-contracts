"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Wallet, AlertCircle, Inbox, Pencil, Check } from "lucide-react";
import Navbar, { type NetworkChoice } from "@/components/Navbar";
import DomainCard from "@/components/DomainCard";
import {
  DEMO_MODE,
  namesOwnedBy,
  primaryNameOf,
  setPrimaryName,
  DEMO_OWNER,
  type NameRecordView,
} from "@/lib/sidera";
import { useWallet } from "@/lib/useWallet";

export default function DashboardPage() {
  const wallet = useWallet();
  const [network, setNetwork] = useState<NetworkChoice>("testnet");
  const [records, setRecords] = useState<NameRecordView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primary, setPrimary] = useState<string | null>(null);
  const [editingPrimary, setEditingPrimary] = useState(false);
  const [primaryInput, setPrimaryInput] = useState("");
  const [savingPrimary, setSavingPrimary] = useState(false);

  // Demo mode: show the demo owner's names without requiring a wallet.
  const owner = wallet.connected ? wallet.address : DEMO_MODE ? DEMO_OWNER : null;

  const load = useCallback(async () => {
    if (owner == null) return;
    setLoading(true);
    setError(null);
    try {
      const [owned, preferred] = await Promise.all([namesOwnedBy(owner), primaryNameOf(owner)]);
      setRecords(owned);
      setPrimary(preferred);
      setPrimaryInput(preferred ?? "");
    } catch {
      setError("Could not load your names — is the registry reachable?");
    } finally {
      setLoading(false);
    }
  }, [owner]);

  async function savePrimary() {
    if (owner == null) return;
    setSavingPrimary(true);
    setError(null);
    try {
      await setPrimaryName(owner, primaryInput);
      setPrimary(primaryInput.trim().toLowerCase().replace(/\.sid$/, ""));
      setEditingPrimary(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your primary name");
    } finally {
      setSavingPrimary(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <Navbar network={network} onNetworkChange={setNetwork} />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-12">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Your names</h1>
            <p className="mt-1 text-sm text-gray-400">
              {owner ? (
                <>
                  owned by <code className="font-mono text-xs text-gray-300">{owner}</code>
                </>
              ) : (
                "connect a wallet to list your names"
              )}
            </p>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl bg-star-600 px-4 py-2 text-sm font-medium text-white hover:bg-star-500"
          >
            <Plus className="h-4 w-4" aria-hidden /> New name
          </Link>
        </header>

        {owner && (
          <section className="mb-6 rounded-2xl border border-space-800 bg-space-900 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Preferred display name</p>
                {editingPrimary ? (
                  <input
                    value={primaryInput}
                    onChange={(e) => setPrimaryInput(e.target.value)}
                    placeholder="your-name"
                    aria-label="Preferred display name"
                    className="mt-2 w-full rounded-lg border border-space-700 bg-space-950 px-3 py-2 font-mono text-sm text-white outline-none focus:border-star-500"
                  />
                ) : (
                  <p className="mt-1 font-mono text-lg text-white">{primary ? `${primary}.sid` : "not set"}</p>
                )}
              </div>
              {editingPrimary ? (
                <button
                  type="button"
                  onClick={() => void savePrimary()}
                  disabled={savingPrimary || primaryInput.trim().length === 0}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-star-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  <Check className="h-4 w-4" aria-hidden /> {savingPrimary ? "saving…" : "Save"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingPrimary(true)}
                  className="flex shrink-0 items-center gap-2 rounded-lg border border-space-700 px-3 py-2 text-sm text-gray-300 hover:border-star-500 hover:text-white"
                >
                  <Pencil className="h-4 w-4" aria-hidden /> Edit
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Wallets can show this name when displaying your address. {DEMO_MODE ? "Demo changes stay in this browser." : "Saving opens Freighter for approval."}
            </p>
          </section>
        )}

        {!wallet.ready && !DEMO_MODE && (
          <div className="h-24 animate-pulse rounded-2xl bg-space-900" aria-hidden />
        )}

        {wallet.ready && owner == null && (
          <div className="rounded-2xl border border-space-800 bg-space-900 p-10 text-center">
            <Wallet className="mx-auto mb-3 h-8 w-8 text-gray-600" aria-hidden />
            <p className="text-gray-300">No wallet connected.</p>
            <p className="mt-1 text-sm text-gray-500">
              Use the Connect button in the header — or browse the{" "}
              <Link href="/" className="text-star-400 hover:underline">
                demo registry
              </Link>
              .
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-space-800 bg-space-900 py-12 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> loading your names…
          </div>
        )}

        {error && (
          <p className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}

        {records != null && !loading && records.length === 0 && (
          <div className="rounded-2xl border border-space-800 bg-space-900 p-10 text-center">
            <Inbox className="mx-auto mb-3 h-8 w-8 text-gray-600" aria-hidden />
            <p className="text-gray-300">No names yet.</p>
            <p className="mt-1 text-sm text-gray-500">Claim your first .sid from the search page.</p>
          </div>
        )}

        {records != null && records.length > 0 && (
          <div className="space-y-4">
            {records.map((r) => (
              <DomainCard key={r.fullName} record={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
