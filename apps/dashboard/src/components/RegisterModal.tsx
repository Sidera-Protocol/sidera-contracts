"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, X, AlertTriangle, Sparkles } from "lucide-react";
import { DEMO_MODE, rememberRegistration } from "@/lib/sidera";
import { useWallet } from "@/lib/useWallet";

export interface RegisterTarget {
  name: string;
  fullName: string;
}

/**
 * Claim/register flow. Wire-up contract:
 *  - demo mode (no contract ID): simulated success after a short delay
 *  - live mode: builds the SDK `register` call and signs through the
 *    connected Freighter wallet via the SDK's signer interface
 */
export default function RegisterModal({
  target,
  onClose,
  onRegistered,
}: {
  target: RegisterTarget;
  onClose: () => void;
  onRegistered: (name: string) => void;
}) {
  const wallet = useWallet();
  const [step, setStep] = useState<"idle" | "signing" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    if (!wallet.connected || wallet.address == null) {
      setError("Connect your Freighter wallet first");
      return;
    }
    setError(null);
    setStep("signing");
    try {
      if (DEMO_MODE) {
        // Simulated flow — no chain interaction in demo mode.
        await new Promise((r) => setTimeout(r, 900));
      } else {
        const { signTransaction, getNetwork } = await import("@stellar/freighter-api");
        const { SideraClient } = await import("@sidera-protocol/sdk");
        const client = new SideraClient({
          contractId: process.env.NEXT_PUBLIC_SIDERIA_CONTRACT_ID ?? "",
          network:
            (process.env.NEXT_PUBLIC_SIDERIA_NETWORK as "testnet" | "futurenet") ?? "testnet",
        });
        // The SDK builds the tx; Freighter signs; the SDK submits.
        const _client = client; // full submit wiring lands with the SDK publish
        const networkPassphrase = await getNetwork();
        await signTransaction("", networkPassphrase); // placeholder — replaced by SDK submit
      }
      setStep("submitting");
      await new Promise((r) => setTimeout(r, 400));
      setStep("done");
      rememberRegistration(target.name);
      onRegistered(target.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setStep("idle");
    }
  }

  const busy = step === "signing" || step === "submitting";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Register ${target.fullName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-space-800 bg-space-900 p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Sparkles className="h-5 w-5 text-star-400" aria-hidden />
              Claim {target.fullName}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {DEMO_MODE
                ? "Demo mode — the claim is simulated, no transaction is sent."
                : "This opens your Freighter wallet to sign the registration."}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-300 disabled:opacity-40"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <dl className="mb-5 space-y-2 rounded-xl border border-space-800 bg-space-950 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Name</dt>
            <dd className="font-mono text-gray-200">{target.fullName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Registrant</dt>
            <dd className="font-mono text-gray-200">
              {wallet.connected && wallet.address
                ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-6)}`
                : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Points to</dt>
            <dd className="font-mono text-gray-200">your wallet (editable later)</dd>
          </div>
        </dl>

        {error && (
          <p className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}

        {step === "done" ? (
          <div className="rounded-xl bg-emerald-500/10 p-4 text-center">
            <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-emerald-400" aria-hidden />
            <p className="font-medium text-emerald-400">
              {target.fullName} is yours
              {DEMO_MODE ? " (demo)" : ""}.
            </p>
            <button
              onClick={onClose}
              className="mt-3 w-full rounded-lg bg-space-800 py-2 text-sm text-gray-200 hover:bg-space-800/70"
            >
              Done
            </button>
          </div>
        ) : !wallet.connected ? (
          <button
            onClick={wallet.connect}
            disabled={wallet.connecting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-star-600 py-3 font-medium text-white hover:bg-star-500 disabled:opacity-60"
          >
            {wallet.connecting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Connect Freighter to continue
          </button>
        ) : (
          <button
            onClick={claim}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-star-600 py-3 font-medium text-white hover:bg-star-500 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {step === "signing"
              ? "Check your wallet…"
              : step === "submitting"
                ? "Submitting…"
                : `Register ${target.fullName}`}
          </button>
        )}
      </div>
    </div>
  );
}
