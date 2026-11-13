"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { PROFILE_FIELDS } from "@/components/DomainCard";
import { DEMO_MODE, deleteSubname, nameExtras, saveRecord, saveSubname, type SubnameView } from "@/lib/sidera";

const LABEL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const input =
  "w-full rounded-lg border border-space-700 bg-space-950 px-3 py-2 font-mono text-sm text-white outline-none focus:border-star-500";

/** Byte length, as the contract counts it. */
const bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * Subnames and profile records of one name the user owns. Every change is a
 * transaction the owner approves in Freighter.
 */
export default function NameManager({ name, owner }: { name: string; owner: string }) {
  const [subnames, setSubnames] = useState<SubnameView[] | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState(owner);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const extras = await nameExtras(name);
      setSubnames(extras.subnames);
      setSaved(extras.records);
      setDraft(extras.records);
    } catch {
      setError("Could not load subnames and profile");
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(what: string, action: () => Promise<void>) {
    setBusy(what);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The change failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const cleanLabel = label.trim().toLowerCase();
  const labelProblem =
    cleanLabel.length === 0
      ? null
      : !LABEL_RE.test(cleanLabel) || cleanLabel.length > 32
        ? "1–32 of a–z, 0–9 and inner hyphens"
        : null;
  const memoProblem = bytes(memo) > 28 ? "at most 28 bytes" : null;

  async function addSubname() {
    const ok = await run("add", () => saveSubname(owner, name, cleanLabel, address.trim(), memo));
    if (ok) {
      setLabel("");
      setMemo("");
    }
  }

  const changed = PROFILE_FIELDS.filter((f) => (draft[f.key] ?? "").trim() !== (saved[f.key] ?? ""));
  async function saveProfile() {
    await run("profile", async () => {
      for (const f of changed) {
        await saveRecord(owner, name, f.key, (draft[f.key] ?? "").trim());
      }
    });
  }

  return (
    <div className="space-y-6 rounded-b-2xl border border-t-0 border-space-800 bg-space-950/60 p-5">
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <section aria-label={`Subnames of ${name}.sid`}>
        <h3 className="text-sm font-medium text-white">Subnames</h3>
        <p className="mt-1 text-xs text-gray-500">
          Free names under {name}.sid, each with its own address and memo, such as pay.{name}.sid. At most 50.
        </p>
        {subnames == null ? (
          <Loader2 className="mt-3 h-4 w-4 animate-spin text-gray-500" aria-hidden />
        ) : subnames.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No subnames yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-space-800 rounded-lg border border-space-800">
            {subnames.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-mono text-gray-100">{s.fullName}</p>
                  <p className="truncate font-mono text-xs text-gray-500">
                    {s.address}
                    {s.memo ? ` · memo ${s.memo.value}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${s.fullName}`}
                  disabled={busy != null}
                  onClick={() => void run(`rm-${s.label}`, () => deleteSubname(owner, name, s.label))}
                  className="shrink-0 text-gray-500 hover:text-red-400 disabled:opacity-40"
                >
                  {busy === `rm-${s.label}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-3 grid gap-2 sm:grid-cols-[8rem_1fr_7rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void addSubname();
          }}
        >
          <input aria-label="Subname label" placeholder="pay" value={label} onChange={(e) => setLabel(e.target.value)} className={input} />
          <input aria-label="Subname address" placeholder="G… address" value={address} onChange={(e) => setAddress(e.target.value)} className={input} />
          <input aria-label="Subname memo" placeholder="memo (optional)" value={memo} onChange={(e) => setMemo(e.target.value)} className={input} />
          <button
            type="submit"
            disabled={busy != null || cleanLabel.length === 0 || labelProblem != null || memoProblem != null || address.trim().length === 0}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-star-600 px-3 py-2 text-sm text-white hover:bg-star-500 disabled:opacity-50"
          >
            {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Save
          </button>
        </form>
        {(labelProblem || memoProblem) && (
          <p className="mt-1 text-xs text-red-400">{labelProblem ? `Label: ${labelProblem}` : `Memo: ${memoProblem}`}</p>
        )}
      </section>

      <section aria-label={`Profile of ${name}.sid`}>
        <h3 className="text-sm font-medium text-white">Profile</h3>
        <p className="mt-1 text-xs text-gray-500">Public details anyone can read with the name. Leave a field empty to remove it.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-center">
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key} className="contents">
              <span className="text-sm text-gray-400">{f.label}</span>
              <input
                value={draft[f.key] ?? ""}
                placeholder={f.placeholder}
                maxLength={256}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className={input}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void saveProfile()}
          disabled={busy != null || changed.length === 0}
          className="mt-3 flex items-center gap-2 rounded-lg bg-star-600 px-4 py-2 text-sm text-white hover:bg-star-500 disabled:opacity-50"
        >
          {busy === "profile" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save profile
          {changed.length > 1 && !DEMO_MODE ? ` (${changed.length} approvals)` : ""}
        </button>
      </section>
    </div>
  );
}
