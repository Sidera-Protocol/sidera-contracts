import { CheckCircle2, Copy, Hash, Tag } from "lucide-react";
import type { NameRecordView } from "@/lib/sidera";

function MemoTag({ type }: { type: "id" | "text" }) {
  const isId = type === "id";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isId ? "bg-emerald-500/10 text-emerald-400" : "bg-sky-500/10 text-sky-400"
      }`}
    >
      {isId ? <Hash className="h-3 w-3" aria-hidden /> : <Tag className="h-3 w-3" aria-hidden />}
      {isId ? "MEMO_ID" : "MEMO_TEXT"}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 flex items-center gap-2 break-all font-mono text-sm text-gray-200">
        {value}
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => navigator.clipboard?.writeText(value)}
          className="text-gray-500 hover:text-star-400"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
        </button>
      </dd>
    </div>
  );
}

/** Viewer for a registered name record. */
export default function DomainCard({ record }: { record: NameRecordView }) {
  return (
    <article className="rounded-2xl border border-space-800 bg-space-900 p-6">
      <header className="mb-5 flex items-center justify-between">
        <h2 className="font-mono text-2xl font-semibold text-white">
          {record.fullName}
        </h2>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> registered
        </span>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Owner" value={record.owner} />
        <Field label="Resolves to" value={record.address} />
      </dl>

      <div className="mt-5 flex items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-gray-500">Memo hint</span>
        {record.memo ? (
          <>
            <MemoTag type={record.memo.type} />
            <code className="rounded bg-space-800 px-2 py-0.5 font-mono text-sm text-gray-200">
              {record.memo.value}
            </code>
          </>
        ) : (
          <span className="text-sm text-gray-500">none — direct wallet payment</span>
        )}
      </div>

      {record.source === "demo" && (
        <p className="mt-4 text-xs text-amber-400/80">
          demo data — set NEXT_PUBLIC_SIDERIA_CONTRACT_ID to query the live registry
        </p>
      )}
    </article>
  );
}
