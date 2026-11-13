/**
 * Memo-hint parsing — the reason Sidera exists. Exchange deposits on
 * Stellar require a memo; a payment sent without it is lost. The registry
 * stores the hint as a free-form string; this module turns it into
 * Stellar-native `Memo` objects wallets can attach directly.
 */

import { Memo } from "@stellar/stellar-sdk";
import { SideraError } from "./errors.js";
import type { ParsedMemo } from "./types.js";

/** Stellar's MEMO_TEXT limit, in bytes. */
export const MAX_MEMO_TEXT_BYTES = 28;
const U64_MAX = 18446744073709551615n;

/**
 * Turn a registry memo hint into the exact memo to attach.
 *
 * The memo must reach the destination **exactly as stored**: a changed deposit
 * memo credits the wrong customer or none. So this never trims, never drops
 * leading zeros, and never shortens:
 * - a plain number without leading zeros that fits a u64 → `MEMO_ID`
 * - anything else that fits 28 bytes → `MEMO_TEXT`, byte for byte
 * - longer than 28 bytes → throws `MemoTooLong`; the payment must not be sent
 *
 * @throws `SideraError` with code `MemoTooLong`.
 */
export function parseMemoHint(raw: string | null | undefined): ParsedMemo | null {
  if (raw == null || raw.length === 0) {
    return null;
  }
  if (/^(0|[1-9]\d{0,19})$/.test(raw) && BigInt(raw) <= U64_MAX) {
    return { type: "id", value: raw };
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_MEMO_TEXT_BYTES) {
    throw new SideraError(
      "MemoTooLong",
      `This destination's memo is longer than ${MAX_MEMO_TEXT_BYTES} bytes, so it cannot be ` +
        "attached without changing it. Do not send: ask the recipient for a valid memo.",
    );
  }
  return { type: "text", value: raw };
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
