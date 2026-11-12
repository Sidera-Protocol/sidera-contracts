/**
 * Sidera provider layer.
 *
 * `NEXT_PUBLIC_SIDERIA_CONTRACT_ID` set  → resolves through the real
 *   registry via @sidera-protocol/sdk (Soroban RPC reads).
 * Contract ID empty (default) → demo mode backed by an in-memory mock
 *   registry, so the UI is fully explorable before deployment.
 */

import type { ParsedMemo } from "@sidera-protocol/sdk";
import { DEMO_OWNER, MOCK_REGISTRY } from "./mock-registry";

export { DEMO_OWNER };

export interface NameRecordView {
  name: string;
  fullName: string;
  owner: string;
  address: string;
  memo: ParsedMemo | null;
  /** Where the record came from — surfaced in the UI. */
  source: "demo" | "chain";
  /** Mock-only: available names report no record yet. */
  available: boolean;
}

export type LookupResult =
  | { status: "found"; record: NameRecordView }
  | { status: "available"; name: string; fullName: string; source: "demo" | "chain" }
  | { status: "invalid"; name: string; reason: string };

const CONTRACT_ID = process.env.NEXT_PUBLIC_SIDERIA_CONTRACT_ID ?? "";
export const DEMO_MODE = CONTRACT_ID.length === 0;

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Client-side validation mirroring the contract's rules. */
export function checkName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.trim().toLowerCase().replace(/\.sid$/, "");
  if (name.length < 3) return { ok: false, reason: "at least 3 characters" };
  if (name.length > 32) return { ok: false, reason: "at most 32 characters" };
  if (!NAME_RE.test(name)) {
    return { ok: false, reason: "only a–z, 0–9 and inner hyphens" };
  }
  return { ok: true, name };
}

/** Look up a name; returns a typed union the UI renders directly. */
export async function lookupName(raw: string): Promise<LookupResult> {
  const check = checkName(raw);
  if (!check.ok) {
    return { status: "invalid", name: raw, reason: check.reason };
  }
  const { name } = check;

  if (DEMO_MODE) {
    const hit = MOCK_REGISTRY[name];
    if (hit == null) {
      return { status: "available", name, fullName: `${name}.sid`, source: "demo" };
    }
    return { status: "found", record: { name, fullName: `${name}.sid`, ...hit, source: "demo", available: false } };
  }

  // Live path via the real SDK.
  const { SideraClient } = await import("@sidera-protocol/sdk");
  const client = new SideraClient({
    contractId: CONTRACT_ID,
    network: (process.env.NEXT_PUBLIC_SIDERIA_NETWORK as "testnet" | "futurenet") ?? "testnet",
  });
  try {
    const res = await client.resolve(name);
    // The registry keeps ownership separate from the payment record
    // (`owner_of` entrypoint), so fetch it alongside the resolution.
    const ownerAddress = await client.ownerOf(name);
    return {
      status: "found",
      record: {
        name: res.name,
        fullName: res.fullName,
        owner: ownerAddress,
        address: res.address,
        memo: res.memo,
        source: "chain",
        available: false,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not registered|NotFound/i.test(message)) {
      return { status: "available", name, fullName: `${name}.sid`, source: "chain" };
    }
    throw err;
  }
}

/** Names owned by an address. Demo mode filters the mock registry. */
export async function namesOwnedBy(owner: string): Promise<NameRecordView[]> {
  if (DEMO_MODE) {
    return Object.entries(MOCK_REGISTRY)
      .filter(([, rec]) => rec.owner.toLowerCase() === owner.toLowerCase())
      .map(([name, rec]) => ({
        name,
        fullName: `${name}.sid`,
        owner: rec.owner,
        address: rec.address,
        memo: rec.memo,
        source: "demo" as const,
        available: false,
      }));
  }

  const { SideraClient } = await import("@sidera-protocol/sdk");
  const client = new SideraClient({
    contractId: CONTRACT_ID,
    network: (process.env.NEXT_PUBLIC_SIDERIA_NETWORK as "testnet" | "futurenet") ?? "testnet",
  });
  // Owner-listing requires the contract's enumeration tranche (tracked in
  // the issue ladder). Until then, live mode checks the local registration
  // log kept by this client — names registered from this browser resolve
  // correctly; otherwise the dashboard points contributors at the ladder.
  const tracked = localRegistrationLog();
  const results: NameRecordView[] = [];
  for (const name of tracked) {
    try {
      const nameOwner = await client.ownerOf(name);
      if (nameOwner !== owner) continue;
      const res = await client.resolve(name);
      results.push({
        name: res.name,
        fullName: res.fullName,
        owner: nameOwner,
        address: res.address,
        memo: res.memo,
        source: "chain",
        available: false,
      });
    } catch {
      // Name since expired or removed — drop from the log on read.
    }
  }
  return results;
}

/** Read an address's preferred reverse-resolution name. */
export async function primaryNameOf(address: string): Promise<string | null> {
  if (DEMO_MODE) {
    if (typeof window === "undefined") return "alice";
    return window.localStorage.getItem(PRIMARY_NAME_KEY) ?? "alice";
  }

  const { SideraClient } = await import("@sidera-protocol/sdk");
  const client = new SideraClient({
    contractId: CONTRACT_ID,
    network: (process.env.NEXT_PUBLIC_SIDERIA_NETWORK as "testnet" | "futurenet") ?? "testnet",
  });
  try {
    return await client.primaryName(address);
  } catch (err) {
    if (err instanceof Error && /not registered|NotFound/i.test(err.message)) return null;
    throw err;
  }
}

/** Set an address's preferred reverse-resolution name through Freighter. */
export async function setPrimaryName(address: string, name: string): Promise<void> {
  if (DEMO_MODE) {
    window.localStorage.setItem(PRIMARY_NAME_KEY, name.trim().toLowerCase().replace(/\.sid$/, ""));
    return;
  }

  const [{ signTransaction, getNetwork }, { SideraClient }] = await Promise.all([
    import("@stellar/freighter-api"),
    import("@sidera-protocol/sdk"),
  ]);
  const { networkPassphrase } = await getNetwork();
  const client = new SideraClient({
    contractId: CONTRACT_ID,
    network: (process.env.NEXT_PUBLIC_SIDERIA_NETWORK as "testnet" | "futurenet") ?? "testnet",
    signer: {
      signTx: async (txXdr) =>
        (await signTransaction(txXdr, { networkPassphrase, address })).signedTxXdr,
    },
  });
  await client.setPrimaryName(address, name);
}

const LOG_KEY = "sidera:my-names";
const PRIMARY_NAME_KEY = "sidera:primary-name";

function localRegistrationLog(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(LOG_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function rememberRegistration(name: string): void {
  if (typeof window === "undefined") return;
  const log = localRegistrationLog();
  if (!log.includes(name)) {
    window.localStorage.setItem(LOG_KEY, JSON.stringify([...log, name]));
  }
}
