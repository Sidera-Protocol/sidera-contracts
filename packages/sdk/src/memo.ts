/**
 * Memo-hint parsing — the reason Sidera exists. Exchange deposits on
 * Stellar require a memo; a payment sent without it is lost. The registry
 * stores the hint as a free-form string; this module turns it into
 * Stellar-native `Memo` objects wallets can attach directly.
 */

import { Memo } from "@stellar/stellar-sdk";
import type { ParsedMemo } from "./types.js";

/** Extract a parsed memo from a raw registry string. */
export function parseMemoHint(raw: string | null | undefined): ParsedMemo | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  // Pure digits → MEMO_ID (the dominant exchange convention).
  if (/^\d{1,20}$/.test(trimmed)) {
    return { type: "id", value: trimmed };
  }
  // Anything else → MEMO_TEXT (max 28 bytes per Stellar protocol).
  if (Buffer.byteLength(trimmed, "utf8") > 28) {
    return { type: "text", value: truncateUtf8(trimmed, 28) };
  }
  return { type: "text", value: trimmed };
}

/** Byte-aware truncation: never splits a multi-byte character mid-sequence. */
function truncateUtf8(value: string, maxBytes: number): string {
  let out = "";
  let used = 0;
  for (const ch of value) {
    const size = Buffer.byteLength(ch, "utf8");
    if (used + size > maxBytes) {
      break;
    }
    out += ch;
    used += size;
  }
  return out;
}

/**
 * Build a Stellar SDK `Memo` from a parsed hint. Returns `Memo.none()`
 * when the hint is absent, so callers can always pass the result through
 * to `Operation.payment({ memo })`.
 */
export function toStellarMemo(memo: ParsedMemo | null): Memo {
  if (memo == null) {
    return Memo.none();
  }
  return memo.type === "id" ? Memo.id(memo.value) : Memo.text(memo.value);
}
