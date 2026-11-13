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
  /** When the registration expires (null in demo mode). */
  expiresAt: Date | null;
}

export type LookupResult =
  | { status: "found"; record: NameRecordView }
  | { status: "expired"; name: string; fullName: string; owner: string; expiresAt: Date; releasedAt: Date }
  | { status: "available"; name: string; fullName: string; source: "demo" | "chain" }
  | { status: "invalid"; name: string; reason: string };

const CONTRACT_ID = process.env.NEXT_PUBLIC_SIDERIA_CONTRACT_ID ?? "";
const NETWORK = (process.env.NEXT_PUBLIC_SIDERIA_NETWORK as "testnet" | "futurenet") ?? "testnet";
export const DEMO_MODE = CONTRACT_ID.length === 0;

/** After expiry, only the owner's renewal is possible for this long (matches the contract). */
const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

async function readClient() {
  const { SideraClient } = await import("@sidera-protocol/sdk");
  return new SideraClient({ contractId: CONTRACT_ID, network: NETWORK });
}

/** A client whose writes are signed by `address` through Freighter. */
async function writeClient(address: string) {
  const [{ signTransaction, getNetwork }, { SideraClient }] = await Promise.all([
    import("@stellar/freighter-api"),
    import("@sidera-protocol/sdk"),
  ]);
  const { networkPassphrase } = await getNetwork();
  return new SideraClient({
    contractId: CONTRACT_ID,
    network: NETWORK,
    signer: {
      signTx: async (txXdr) => {
        const signed = await signTransaction(txXdr, { networkPassphrase, address });
        if ("error" in signed && signed.error) {
          throw new Error("The transaction was not signed in Freighter");
        }
        return signed.signedTxXdr;
      },
    },
  });
}

/** Stroops (7 decimals) → "2", "0.5", "12.25". */
function formatUnits(amount: bigint): string {
  const whole = amount / 10_000_000n;
  const frac = (amount % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Price of `years` years of `name`, ready to display. Demo mode uses the testnet demo prices. */
export async function quotePrice(name: string, years: number): Promise<{ amount: bigint; display: string }> {
  let amount: bigint;
  let symbol = "XLM";
  if (DEMO_MODE) {
    const perYear = name.length === 3 ? 500_000_000n : name.length === 4 ? 100_000_000n : 20_000_000n;
    amount = perYear * BigInt(years);
  } else {
    const client = await readClient();
    const [quote, config] = await Promise.all([client.price(name, years), client.config()]);
    amount = quote;
    const { Asset, Networks } = await import("@stellar/stellar-sdk");
    const passphrase = NETWORK === "futurenet" ? Networks.FUTURENET : Networks.TESTNET;
    if (config.token !== Asset.native().contractId(passphrase)) symbol = "tokens";
  }
  return { amount, display: `${formatUnits(amount)} ${symbol}` };
}

/** Register `name` for `years` years, owned by and pointing to `owner`. Returns the expiry. */
export async function registerName(owner: string, name: string, years: number): Promise<Date> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 900));
    return new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000);
  }
  const client = await writeClient(owner);
  const { expiresAt } = await client.register({ name, owner, address: owner, years });
  return expiresAt;
}

/** Renew `name` by `years` years, paid by `payer`. Returns the new expiry. */
export async function renewName(payer: string, name: string, years: number): Promise<Date> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 600));
    return new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000);
  }
  const client = await writeClient(payer);
  return (await client.renew({ name, payer, years })).expiresAt;
}

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
    return {
      status: "found",
      record: { name, fullName: `${name}.sid`, ...hit, source: "demo", available: false, expiresAt: null },
    };
  }

  // Live path via the real SDK.
  const client = await readClient();
  try {
    const res = await client.resolve(name);
    // The registry keeps ownership and expiry separate from the payment
    // record, so fetch them alongside the resolution.
    const [ownerAddress, expiresAt] = await Promise.all([client.ownerOf(name), client.expiresAt(name)]);
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
        expiresAt,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/has expired|NameExpired/i.test(message)) {
      const [owner, expiresAt] = await Promise.all([client.ownerOf(name), client.expiresAt(name)]);
      return {
        status: "expired",
        name,
        fullName: `${name}.sid`,
        owner,
        expiresAt,
        releasedAt: new Date(expiresAt.getTime() + GRACE_PERIOD_MS),
      };
    }
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
        expiresAt: null,
      }));
  }

  // The registry keeps each owner's list of names (`names_of`), so this works
  // from any browser. Names in their grace period no longer resolve; they are
  // still shown so their owner can renew them.
  const client = await readClient();
  const owned = await client.namesOf(owner);
  const results: NameRecordView[] = [];
  for (const { name, expiresAt } of owned) {
    try {
      const res = await client.resolve(name);
      results.push({
        name: res.name,
        fullName: res.fullName,
        owner,
        address: res.address,
        memo: res.memo,
        source: "chain",
        available: false,
        expiresAt,
      });
    } catch (err) {
      if (!(err instanceof Error && /has expired|NameExpired/i.test(err.message))) throw err;
      results.push({
        name,
        fullName: `${name}.sid`,
        owner,
        address: "expired: renew to restore resolution",
        memo: null,
        source: "chain",
        available: false,
        expiresAt,
      });
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

  const client = await readClient();
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

  const client = await writeClient(address);
  await client.setPrimaryName(address, name);
}

const PRIMARY_NAME_KEY = "sidera:primary-name";

/** What the user reviewed before paying: where the money goes, and with which memo. */
export interface PaymentReview {
  name: string;
  address: string;
  memo: ParsedMemo | null;
}

/**
 * Pay `amount` XLM to `name`. The name is resolved again right before sending
 * and must still match what the user reviewed, so a name repointed in the
 * meantime never receives money the user did not confirm. The memo hint is
 * attached by the SDK's `buildPayment`. Returns the transaction hash.
 */
export async function payName(from: string, review: PaymentReview, amount: string): Promise<string> {
  if (!/^\d+(\.\d{1,7})?$/.test(amount) || Number(amount) <= 0) {
    throw new Error("Enter an amount greater than 0, with at most 7 decimals");
  }
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 900));
    return "demo-transaction";
  }

  const client = await readClient();
  const fresh = await client.resolve(review.name);
  const sameMemo = (fresh.memo?.type ?? null) === (review.memo?.type ?? null) && (fresh.memo?.value ?? null) === (review.memo?.value ?? null);
  if (fresh.address !== review.address || !sameMemo) {
    throw new Error(`${review.name}.sid changed since you reviewed it. Look it up again before paying.`);
  }

  const [{ signTransaction, getNetwork }, { Horizon, TransactionBuilder }, { buildPayment }] = await Promise.all([
    import("@stellar/freighter-api"),
    import("@stellar/stellar-sdk"),
    import("@sidera-protocol/sdk"),
  ]);
  const { networkPassphrase } = await getNetwork();
  const horizon = new Horizon.Server(
    NETWORK === "futurenet" ? "https://horizon-futurenet.stellar.org" : "https://horizon-testnet.stellar.org",
  );
  const source = await horizon.loadAccount(from);
  const tx = buildPayment({ source, to: fresh, amount, networkPassphrase });

  const signed = await signTransaction(tx.toXDR(), { networkPassphrase, address: from });
  if ("error" in signed && signed.error) {
    throw new Error("The payment was not signed in Freighter");
  }
  const result = await horizon.submitTransaction(TransactionBuilder.fromXDR(signed.signedTxXdr, networkPassphrase));
  return result.hash;
}
