/**
 * Core types for the Sidera SDK.
 */

/** Networks the SDK can target. */
export type SideraNetwork = "testnet" | "mainnet" | (string & {});

/**
 * Client configuration.
 *
 * @example
 * ```ts
 * const config: SideraConfig = {
 *   contractId: "CCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
 *   network: "testnet",
 *   // rpcUrl is optional; defaults to the public RPC for the network
 * };
 * ```
 */
export interface SideraConfig {
  /** Deployed Sidera registry contract ID (C... string). */
  contractId: string;
  /** Target network. Custom network names require an explicit `rpcUrl`. */
  network: SideraNetwork;
  /** Soroban RPC endpoint. Defaults to the public endpoint for `network`. */
  rpcUrl?: string;
  /** Network passphrase. Required alongside `rpcUrl` for custom networks. */
  passphrase?: string;
  /** Override the wallet/keystore integration used for signing (optional). */
  signer?: SideraSigner;
}

/**
 * A name record as stored in the Sidera registry.
 */
export interface NameRecord {
  /** Bare name, without the `.sid` suffix. */
  name: string;
  /** Current owner of the name (G-address). */
  owner: string;
  /** The destination address the name points at (G- or M-address). */
  address: string;
  /** Optional memo hint required by the destination. */
  memo?: string;
}

/**
 * The result of resolving a name: everything a wallet needs to build a
 * safe payment — destination address, extracted memo, and provenance.
 */
export interface ResolutionResult {
  /** Bare name that was resolved (no `.sid` suffix). */
  name: string;
  /** Canonical form including the `.sid` suffix. */
  fullName: string;
  /** The destination address (G- or M-address). */
  address: string;
  /** Parsed memo hint, ready to attach to a Stellar transaction. */
  memo: ParsedMemo | null;
}

/**
 * A memo parsed into Stellar-native shape. Wallets can feed `type` and
 * `value` straight into `Operation.payment({ memo })`.
 */
export interface ParsedMemo {
  /** Stellar memo type: `id` → MEMO_ID, `text` → MEMO_TEXT. */
  type: "id" | "text";
  /** The memo payload (numeric string for `id`). */
  value: string;
}

/** Parameters for registering a name. */
export interface RegisterParams {
  /** Bare name to register (3–32 chars, a–z / 0–9 / inner hyphens). */
  name: string;
  /** Address that will own the name (must sign). */
  owner: string;
  /** Initial destination address. */
  address: string;
  /** Optional memo hint for the destination. */
  memo?: string;
  /** Years to register for, 1–10. Defaults to 1. The owner pays `price(name, years)`. */
  years?: number;
}

/** Parameters for renewing a name. Anyone may pay. */
export interface RenewParams {
  /** Bare name to renew. */
  name: string;
  /** Address that pays (must sign). */
  payer: string;
  /** Years to add, 1–10. Defaults to 1. */
  years?: number;
}

/** Result of a write that sets an expiry (`register`, `renew`). */
export interface ExpiryResult {
  /** Transaction hash. */
  hash: string;
  /** When the name now expires. */
  expiresAt: Date;
}

/** A name an address holds, from `namesOf`. */
export interface OwnedName {
  /** Bare name, without the `.sid` suffix. */
  name: string;
  /** When the registration expires. */
  expiresAt: Date;
}

/** Registry settings as stored on-chain. Prices are per year, in the token's smallest unit. */
export interface RegistryConfig {
  admin: string;
  /** SEP-41 payment token contract (C...). */
  token: string;
  /** Receives payments. */
  treasury: string;
  prices: {
    three: bigint;
    four: bigint;
    fivePlus: bigint;
  };
}

/** A subname of a name, from `subnames`. */
export interface SubnameRecord {
  /** The label, e.g. `pay` for `pay.alice`. */
  label: string;
  /** Full name with suffix, e.g. `pay.alice.sid`. */
  fullName: string;
  /** Where payments to the subname go. */
  address: string;
  /** Parsed memo hint, ready to attach to a payment. */
  memo: ParsedMemo | null;
}

/** Parameters for creating or updating a subname. */
export interface SubnameParams {
  /** The parent name the caller owns, e.g. `alice`. */
  parent: string;
  /** The label, e.g. `pay` (1–32 of a–z, 0–9, inner hyphens). */
  label: string;
  /** Where payments to the subname go. */
  address: string;
  /** Optional memo the destination requires (1–28 bytes). */
  memo?: string;
}

/** Parameters for transferring a name. */
export interface TransferParams {
  /** Bare name to transfer. */
  name: string;
  /** Current owner (must sign). */
  from: string;
  /** New owner. */
  to: string;
}

/**
 * Options for building and submitting a transaction through Soroban RPC.
 */
export interface RpcTxOptions {
  /** Maximum fee in stroops. Defaults to the network base fee × safety factor. */
  fee?: number;
  /** Optional transaction timeout in seconds. */
  timeoutSeconds?: number;
  /** Optional memo to attach to the *submission* transaction itself. */
  memo?: ParsedMemo;
}

/**
 * Minimal signer interface so wallets (Freighter, Albedo, …) can plug in
 * without the SDK depending on any one of them.
 */
export interface SideraSigner {
  /** Returns the signature-weighted XDR for the built transaction. */
  signTx: (txXdr: string, networkPassphrase: string) => Promise<string>;
}
