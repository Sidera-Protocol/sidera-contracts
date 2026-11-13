"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, Send, ShieldCheck } from "lucide-react";
import Navbar, { type NetworkChoice } from "@/components/Navbar";
import { DEMO_MODE, lookupName, payName, type PaymentReview } from "@/lib/sidera";
import { useWallet } from "@/lib/useWallet";

const EXPLORER = "https://stellar.expert/explorer/testnet/tx/";

/**
 * Pay a .sid name. The page resolves the name, shows exactly where the money
 * goes and which memo will be attached, and refuses names that are unknown,
 * expired or invalid.
 */
export default function SendPage() {
  const wallet = useWallet();
  const [network, setNetwork] = useState<NetworkChoice>("testnet");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<PaymentReview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<"lookup" | "send" | null>(null);
  const [sentHash, setSentHash] = useState<string | null>(null);

  async function lookUp() {
    setReview(null);
    setProblem(null);
    setSentHash(null);
    setBusy("lookup");
    try {
      const result = await lookupName(name);
      if (result.status === "found") {
        setReview({ name: result.record.name, address: result.record.address, memo: result.record.memo });
      } else if (result.status === "expired") {
        setProblem(`${result.fullName} has expired. Do not send to it.`);
      } else if (result.status === "missing") {
        setProblem(`${result.fullName} does not exist. Check the name with the recipient.`);
      } else if (result.status === "available") {
        setProblem(`${result.fullName} is not registered. Check the name with the recipient.`);
      } else {
        setProblem(`"${result.name}" is not a valid name: ${result.reason}.`);
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not look up the name");
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (review == null) return;
    if (!wallet.connected || wallet.address == null) {
      setProblem("Connect your Freighter wallet first");
      return;
    }
    setProblem(null);
    setBusy("send");
    try {
      setSentHash(await payName(wallet.address, review, amount.trim()));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The payment failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-space-950">
      <Navbar network={network} onNetworkChange={setNetwork} />
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
          <Send className="h-6 w-6 text-star-400" aria-hidden /> Pay a .sid name
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          Exchanges tell deposits apart by memo. Sidera attaches the memo for you, so a deposit
          cannot arrive without it.
        </p>

        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void lookUp();
          }}
        >
          <div>
            <label htmlFor="pay-name" className="text-sm text-gray-400">Recipient</label>
            <div className="mt-1 flex gap-2">
              <input
                id="pay-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setReview(null);
                }}
                placeholder="exchange-user.sid"
                autoComplete="off"
                className="w-full rounded-lg border border-space-700 bg-space-900 px-3 py-2 font-mono text-white outline-none focus:border-star-500"
              />
              <button
                type="submit"
                disabled={name.trim().length === 0 || busy != null}
                className="shrink-0 rounded-lg border border-space-700 px-4 text-sm text-gray-200 hover:border-star-500 disabled:opacity-50"
              >
                {busy === "lookup" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Look up"}
              </button>
            </div>
          </div>
        </form>

        {problem && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {problem}
          </p>
        )}

        {review && (
          <section className="mt-6 rounded-2xl border border-space-800 bg-space-900 p-5" aria-label="Payment review">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Sending to</dt>
                <dd className="mt-1 break-all font-mono text-gray-200">{review.address}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Memo</dt>
                <dd className="mt-1">
                  {review.memo ? (
                    <span className="flex items-center gap-2 text-emerald-400">
                      <ShieldCheck className="h-4 w-4" aria-hidden />
                      <code className="rounded bg-space-800 px-2 py-0.5 font-mono text-gray-100">{review.memo.value}</code>
                      <span className="text-xs text-gray-400">({review.memo.type === "id" ? "MEMO_ID" : "MEMO_TEXT"}) required, attached automatically</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">none: a direct payment to this address</span>
                  )}
                </dd>
              </div>
            </dl>

            <label htmlFor="pay-amount" className="mt-5 block text-sm text-gray-400">Amount (XLM)</label>
            <input
              id="pay-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="10"
              className="mt-1 w-full rounded-lg border border-space-700 bg-space-950 px-3 py-2 font-mono text-white outline-none focus:border-star-500"
            />

            {sentHash ? (
              <div className="mt-5 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-400">
                <p className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Sent{review.memo ? " with the memo" : ""}
                  {DEMO_MODE ? " (demo)" : ""}.
                </p>
                {!DEMO_MODE && (
                  <a href={`${EXPLORER}${sentHash}`} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs underline">
                    View the transaction
                  </a>
                )}
              </div>
            ) : !wallet.connected && !DEMO_MODE ? (
              <button
                onClick={wallet.connect}
                className="mt-5 w-full rounded-xl bg-star-600 py-3 font-medium text-white hover:bg-star-500"
              >
                Connect Freighter to pay
              </button>
            ) : (
              <button
                onClick={() => void pay()}
                disabled={busy != null || amount.trim().length === 0}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-star-600 py-3 font-medium text-white hover:bg-star-500 disabled:opacity-60"
              >
                {busy === "send" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {busy === "send" ? "Confirm in your wallet…" : `Pay ${amount || "…"} XLM to ${review.name}.sid`}
              </button>
            )}
          </section>
        )}

        <p className="mt-8 text-xs text-gray-500">
          Testnet only. <Link href="/" className="text-star-400 hover:underline">Search names</Link>
        </p>
      </main>
    </div>
  );
}
