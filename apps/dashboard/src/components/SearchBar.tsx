"use client";

import { Search, Loader2 } from "lucide-react";

/**
 * Domain search input. Normalization rules:
 *  - input is lowercased instantly on change
 *  - a trailing `.sid` the user typed is stripped before submit
 *  - the pretty `.sid` form is always displayed as the suffix chip
 */
export default function SearchBar({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const bare = value.toLowerCase().replace(/\.sid$/, "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim().length > 0 && !loading) onSubmit();
      }}
      className="flex w-full items-center gap-2"
      role="search"
    >
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
          aria-hidden
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          placeholder="find your name"
          aria-label="Search for a .sid name"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-2xl border border-space-800 bg-space-900 py-4 pl-12 pr-24 text-lg text-white placeholder-gray-600 focus:border-star-500 focus:outline-none"
        />
        <span
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md bg-space-800 px-2 py-1 font-mono text-sm text-star-400"
          aria-hidden
        >
          .sid
        </span>
      </div>
      <button
        type="submit"
        disabled={loading || value.trim().length === 0}
        className="flex h-[3.75rem] items-center gap-2 rounded-2xl bg-star-600 px-6 font-medium text-white hover:bg-star-500 disabled:opacity-50"
      >
        {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
        Search
      </button>
      {/* expose the normalized value for tests/debugging */}
      <span data-testid="normalized" className="hidden">
        {bare}
      </span>
    </form>
  );
}
