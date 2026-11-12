/**
 * Client-side name validation, mirroring the contract's `validate_name`:
 * 3–32 characters of `a–z`, `0–9`, with inner hyphens allowed (no leading
 * or trailing hyphen). Validating on the client gives instant feedback and
 * saves a wasted RPC round-trip.
 */

import { InvalidNameError } from "./errors.js";

export const NAME_MIN_LEN = 3;
export const NAME_MAX_LEN = 32;

export type NameCheck =
  | { ok: true }
  | { ok: false; reason: string };

/** Validate a bare name (no `.sid` suffix). Returns a typed result. */
export function validateName(name: string): NameCheck {
  if (name.length < NAME_MIN_LEN) {
    return { ok: false, reason: `too short (min ${NAME_MIN_LEN} characters)` };
  }
  if (name.length > NAME_MAX_LEN) {
    return { ok: false, reason: `too long (max ${NAME_MAX_LEN} characters)` };
  }
  if (!/^[a-z0-9]+$/.test(name.replaceAll("-", ""))) {
    return {
      ok: false,
      reason: "only lowercase letters, digits, and hyphens are allowed",
    };
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return { ok: false, reason: "hyphens may not lead or trail the name" };
  }
  return { ok: true };
}

/** Throw an `InvalidNameError` if the name fails validation. */
export function assertValidName(name: string): void {
  const check = validateName(name);
  if (!check.ok) {
    throw new InvalidNameError(name, check.reason);
  }
}

/**
 * Normalize user input into a bare name: trims whitespace, lowercases,
 * and strips a trailing `.sid` / `.SID` if the user typed the full name.
 */
export function normalizeName(input: string): string {
  let name = input.trim().toLowerCase();
  if (name.endsWith(".sid")) {
    name = name.slice(0, -".sid".length);
  }
  return name;
}
