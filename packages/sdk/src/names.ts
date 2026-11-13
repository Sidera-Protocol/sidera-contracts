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
  return checkLabel(name, NAME_MIN_LEN);
}

function checkLabel(name: string, min: number): NameCheck {
  if (name.length < min) {
    return {
      ok: false,
      reason: min === 1 ? "the label is empty" : `too short (min ${min} characters)`,
    };
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

/**
 * Validate a subname label (the `pay` in `pay.alice`): 1–32 characters of
 * `a–z`, `0–9` and inner hyphens.
 */
export function validateLabel(label: string): NameCheck {
  return checkLabel(label, 1);
}

/**
 * Split a resolvable name into its parts: `alice` → `{ parent: "alice" }`,
 * `pay.alice` → `{ label: "pay", parent: "alice" }`. Validates both parts;
 * subnames are one level deep.
 */
export function parseName(name: string): { label?: string; parent: string } {
  const parts = name.split(".");
  if (parts.length > 2) {
    throw new InvalidNameError(name, "subnames are one level deep, like pay.alice");
  }
  if (parts.length === 2) {
    const [label, parent] = parts as [string, string];
    const check = validateLabel(label);
    if (!check.ok) {
      throw new InvalidNameError(name, `subname: ${check.reason}`);
    }
    assertValidName(parent);
    return { label, parent };
  }
  assertValidName(name);
  return { parent: name };
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
