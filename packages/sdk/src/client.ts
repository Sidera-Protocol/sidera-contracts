/**
 * SideraClient — the single entry point wallets and payment apps use to
 * talk to a deployed Sidera registry over Soroban RPC.
 *
 * Read calls (`resolve`, `ownerOf`, `exists`, `primaryName`, `expiresAt`, `isAvailable`,
 * `price`, `config`, `namesOf`, `subnames`, `records`) simulate the invocation and decode the result. Write calls
 * (`register`, `renew`, `setAddress`, `transfer`, `setPrimaryName`, `setSubname`,
 * `removeSubname`, `setRecord`) are simulated to
 * prepare their footprint and fees, signed via the configured signer, submitted, and
 * awaited until the network confirms success or failure.
 *
 * Type notes (verified against @stellar/stellar-sdk 13.x):
 * - `TransactionBuilder`, `Account`, `Transaction` are top-level re-exports
 *   of stellar-base; `rpc.Server` is the Soroban RPC client.
 * - Simulation responses are a union discriminated by the presence of
 *   `error`; we derive them from the server's method signatures because
 *   the `Api` namespace is not re-exported publicly.
 * - stellar-base's bundled .d.ts predates the modern `Address` class, so
 *   the constructor is retyped locally (runtime is verified by tests).
 */

import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  rpc,
  scValToBigInt,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { errorFromCode, SideraError } from "./errors.js";
import { assertValidName, normalizeName, parseName, validateLabel } from "./names.js";
import { parseMemoHint } from "./memo.js";
import type {
  ExpiryResult,
  OwnedName,
  ParsedMemo,
  RegisterParams,
  RegistryConfig,
  RenewParams,
  ResolutionResult,
  RpcTxOptions,
  SideraConfig,
  SideraSigner,
  SubnameParams,
  SubnameRecord,
  TransferParams,
} from "./types.js";

const DEFAULT_TESTNET_RPC = "https://soroban-testnet.stellar.org";
const DEFAULT_MAINNET_RPC = "https://soroban-rpc.stellar.org";

/** Throwaway G-address used as the simulation source for read calls. */
const SIMULATION_SOURCE = Keypair.random().publicKey();

/** stellar-base's stale d.ts lacks the modern Address class; retype locally. */
type AddressLike = {
  toScVal(): xdr.ScVal;
  toString(): string;
};
const AddressC = Address as unknown as (new (value: string) => AddressLike) & {
  fromScVal(v: xdr.ScVal): AddressLike;
};

type SimulateResponse = Awaited<ReturnType<rpc.Server["simulateTransaction"]>>;
type SendResponse = Awaited<ReturnType<rpc.Server["sendTransaction"]>>;
type GetTxResponse = Awaited<ReturnType<rpc.Server["getTransaction"]>>;

/** How long to wait for a submitted transaction, polling once a second. */
const CONFIRM_ATTEMPTS = 30;
const CONFIRM_INTERVAL_MS = 1_000;

function networkPassphrase(network: string): string {
  switch (network) {
    case "testnet":
      return Networks.TESTNET;
    case "futurenet":
      return Networks.FUTURENET;
    case "mainnet":
      return Networks.PUBLIC;
    default:
      throw new SideraError(
        "UnknownNetwork",
        `Unknown network "${network}" — pass an explicit rpcUrl`,
      );
  }
}

/** Extract the u32 contract error code from an invocation error string. */
function extractErrorCode(message: string): number | null {
  // Soroban invoke errors surface as: `Error(Contract, #2)` — pull the code.
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(message);
  return match ? Number(match[1]) : null;
}

function toContractError(err: unknown, name: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  const code = extractErrorCode(message);
  if (code != null) {
    return errorFromCode(code, name);
  }
  return err instanceof Error ? err : new SideraError("Rpc", String(err));
}

/**
 * Best-effort traversal of a failed transaction result to recover the
 * contract error code. Defensive across SDK versions: any structural
 * surprise degrades to `null` and the caller reports the generic failure.
 */
function extractContractCode(tr: xdr.TransactionResult): number | null {
  try {
    const result = tr.result() as unknown as {
      switch(): { name: string };
      failed?(): Array<{ tr(): { switch(): { name: string }; invokeHostFnResult?(): { value(): { switch(): { name: string }; error?(): { value(): number } } | undefined } } }>;
    };
    if (result.switch().name !== "txFailed" || result.failed == null) {
      return null;
    }
    for (const op of result.failed()) {
      const opTr = op.tr();
      if (opTr.switch().name === "invokeHostFn" && opTr.invokeHostFnResult != null) {
        const success = opTr.invokeHostFnResult().value();
        if (success && success.switch().name === "contract" && success.error != null) {
          return success.error().value();
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** A name record as returned by the contract's `resolve` entrypoint. */
interface ContractNameRecord {
  address: string;
  memo: string | null;
}

export class SideraClient {
  private readonly contractId: string;
  private readonly network: string;
  private readonly server: rpc.Server;
  private readonly passphrase: string;
  private readonly signer: SideraSigner | undefined;

  constructor(config: SideraConfig) {
    if (!config.contractId || !config.contractId.startsWith("C")) {
      throw new SideraError(
        "InvalidConfig",
        "contractId must be a deployed contract ID (C... string)",
      );
    }
    this.contractId = config.contractId;
    this.network = config.network;
    this.signer = config.signer;
    // Custom networks (with an rpcUrl) must supply their passphrase.
    this.passphrase = config.passphrase ?? networkPassphrase(config.network);
    const rpcUrl =
      config.rpcUrl ??
      (config.network === "testnet" ? DEFAULT_TESTNET_RPC : DEFAULT_MAINNET_RPC);
    this.server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  }

  // ------------------------------------------------------------------
  // Read path
  // ------------------------------------------------------------------

  /**
   * Resolve a name or subname into a full payment destination: address and
   * parsed memo hint. Accepts `alice`, `alice.sid`, `pay.alice` and
   * `pay.alice.sid`.
   *
   * @throws `NameNotFoundError` when the name (or subname) does not exist.
   * @throws `NameExpiredError` when the name, or a subname's parent, expired.
   */
  async resolve(nameInput: string): Promise<ResolutionResult> {
    const name = normalizeName(nameInput);
    parseName(name);

    const record = await this.callRead<ContractNameRecord | null>("resolve", [
      scValString(name),
    ], name);
    if (record == null) {
      throw errorFromCode(1, name);
    }

    const memo: ParsedMemo | null = parseMemoHint(record.memo);
    return {
      name,
      fullName: `${name}.sid`,
      address: record.address,
      memo,
    };
  }

  /** The current owner of a name. */
  async ownerOf(nameInput: string): Promise<string> {
    const name = normalizeName(nameInput);
    assertValidName(name);
    const owner = await this.callRead<string | null>("owner_of", [scValString(name)], name);
    if (owner == null) {
      throw errorFromCode(1, name);
    }
    return owner;
  }

  /** Whether the name is registered. */
  async exists(nameInput: string): Promise<boolean> {
    const name = normalizeName(nameInput);
    assertValidName(name);
    const present = await this.callRead<boolean>("exists", [scValString(name)], name);
    return present === true;
  }

  /**
   * When a name expires. Works while the name is active and during its grace period.
   *
   * @throws `NameNotFoundError` when the name is not registered, or was released.
   */
  async expiresAt(nameInput: string): Promise<Date> {
    const name = normalizeName(nameInput);
    assertValidName(name);
    const seconds = await this.callRead<bigint | null>("expires_at", [scValString(name)], name);
    if (seconds == null) {
      throw errorFromCode(1, name);
    }
    return secondsToDate(seconds);
  }

  /**
   * The names `owner` holds (active or in their grace period), with their
   * expiry, in registration order. Read straight from the registry.
   */
  async namesOf(owner: string): Promise<OwnedName[]> {
    const listed = await this.callRead<Array<{ name: string; expires_at: bigint }> | null>(
      "names_of",
      [addressScVal(owner)],
      owner,
    );
    return (listed ?? []).map((n) => ({ name: n.name, expiresAt: secondsToDate(n.expires_at) }));
  }

  /** Whether a name is valid and can be registered right now. Invalid names return `false`. */
  async isAvailable(nameInput: string): Promise<boolean> {
    const name = normalizeName(nameInput);
    try {
      assertValidName(name);
    } catch {
      return false;
    }
    const free = await this.callRead<boolean>("is_available", [scValString(name)], name);
    return free === true;
  }

  /**
   * What registering or renewing a name for `years` years costs, in the payment
   * token's smallest unit (stroops for XLM).
   */
  async price(nameInput: string, years = 1): Promise<bigint> {
    const name = normalizeName(nameInput);
    assertValidName(name);
    const amount = await this.callRead<bigint>("price", [scValString(name), scValYears(years)], name);
    return BigInt(amount);
  }

  /** The registry's admin, payment token, treasury and yearly prices. */
  async config(): Promise<RegistryConfig> {
    const raw = await this.callRead<{
      admin: string;
      token: string;
      treasury: string;
      prices: { three: bigint; four: bigint; five_plus: bigint };
    }>("config", [], "config");
    return {
      admin: raw.admin,
      token: raw.token,
      treasury: raw.treasury,
      prices: {
        three: BigInt(raw.prices.three),
        four: BigInt(raw.prices.four),
        fivePlus: BigInt(raw.prices.five_plus),
      },
    };
  }

  /**
   * The subnames of `parent` (`pay.alice`, …) with their payment records,
   * ordered by label. Empty when the parent is not active or has none.
   */
  async subnames(parentInput: string): Promise<SubnameRecord[]> {
    const parent = normalizeName(parentInput);
    assertValidName(parent);
    const map = await this.callRead<Record<string, ContractNameRecord> | null>(
      "subnames",
      [scValString(parent)],
      parent,
    );
    return Object.entries(map ?? {}).map(([label, r]) => ({
      label,
      fullName: `${label}.${parent}.sid`,
      address: r.address,
      memo: parseMemoHint(r.memo),
    }));
  }

  /**
   * The profile records of a name (`avatar`, `url`, `com.github`, …).
   * Empty when the name is not active or has none.
   */
  async records(nameInput: string): Promise<Record<string, string>> {
    const name = normalizeName(nameInput);
    assertValidName(name);
    const map = await this.callRead<Record<string, string> | null>("records", [scValString(name)], name);
    return map ?? {};
  }

  /** Return the preferred display name for an address. */
  async primaryName(address: string): Promise<string> {
    const name = await this.callRead<string | null>("primary_name", [addressScVal(address)], address);
    if (name == null) {
      throw errorFromCode(1, address);
    }
    return name;
  }

  // ------------------------------------------------------------------
  // Write path
  // ------------------------------------------------------------------

  /**
   * Register `params.name` for `params.owner` for `params.years` years (default 1).
   * The owner pays `price(name, years)` in the registry's payment token. Returns the
   * transaction hash and the new expiry.
   *
   * @throws `NameTakenError` when the name is active or in its grace period.
   * @throws `InvalidNameError` when validation fails on- or off-chain.
   */
  async register(params: RegisterParams, options: RpcTxOptions = {}): Promise<ExpiryResult> {
    const name = normalizeName(params.name);
    assertValidName(name);
    const { hash, returnValue } = await this.submit(
      "register",
      [
        scValString(name),
        addressScVal(params.owner),
        addressScVal(params.address),
        scValOptionString(params.memo),
        scValYears(params.years ?? 1),
      ],
      params.owner,
      name,
      options,
    );
    return { hash, expiresAt: secondsToDate(returnValue as bigint) };
  }

  /**
   * Extend a name by `params.years` years (default 1), paid by `params.payer`.
   * Anyone may renew; renewing gives no ownership. Works during the grace period.
   *
   * @throws `NameNotFoundError` when the name is not registered, or was released.
   */
  async renew(params: RenewParams, options: RpcTxOptions = {}): Promise<ExpiryResult> {
    const name = normalizeName(params.name);
    assertValidName(name);
    const { hash, returnValue } = await this.submit(
      "renew",
      [scValString(name), addressScVal(params.payer), scValYears(params.years ?? 1)],
      params.payer,
      name,
      options,
    );
    return { hash, expiresAt: secondsToDate(returnValue as bigint) };
  }

  /** Transfer a name to a new owner. Returns the submitted tx hash. */
  async transfer(params: TransferParams, options: RpcTxOptions = {}): Promise<string> {
    const name = normalizeName(params.name);
    assertValidName(name);
    return this.submitForHash(
      "transfer",
      [
        scValString(name),
        addressScVal(params.from),
        addressScVal(params.to),
      ],
      params.from,
      name,
      options,
    );
  }

  /** Update the address (and memo hint) a name points at. Returns the tx hash. */
  async setAddress(
    params: { name: string; address: string; memo?: string },
    caller: string,
    options: RpcTxOptions = {},
  ): Promise<string> {
    const name = normalizeName(params.name);
    assertValidName(name);
    return this.submitForHash(
      "set_address",
      [
        scValString(name),
        addressScVal(caller),
        addressScVal(params.address),
        scValOptionString(params.memo),
      ],
      caller,
      name,
      options,
    );
  }

  /** Set the preferred display name for an address. The address must sign. */
  async setPrimaryName(
    address: string,
    nameInput: string,
    options: RpcTxOptions = {},
  ): Promise<string> {
    const name = normalizeName(nameInput);
    assertValidName(name);
    return this.submitForHash(
      "set_primary_name",
      [addressScVal(address), scValString(name)],
      address,
      name,
      options,
    );
  }

  /**
   * Create or update the subname `label.parent` with its own payment record.
   * `caller` must own the active parent and sign. Subnames are free.
   */
  async setSubname(params: SubnameParams, caller: string, options: RpcTxOptions = {}): Promise<string> {
    const parent = normalizeName(params.parent);
    assertValidName(parent);
    const label = assertLabel(params.label);
    return this.submitForHash(
      "set_subname",
      [
        scValString(parent),
        scValString(label),
        addressScVal(caller),
        addressScVal(params.address),
        scValOptionString(params.memo),
      ],
      caller,
      `${label}.${parent}`,
      options,
    );
  }

  /** Delete the subname `label.parent`. `caller` must own the parent and sign. */
  async removeSubname(
    parentInput: string,
    labelInput: string,
    caller: string,
    options: RpcTxOptions = {},
  ): Promise<string> {
    const parent = normalizeName(parentInput);
    assertValidName(parent);
    const label = assertLabel(labelInput);
    return this.submitForHash(
      "remove_subname",
      [scValString(parent), scValString(label), addressScVal(caller)],
      caller,
      `${label}.${parent}`,
      options,
    );
  }

  /**
   * Set a profile record of a name, or delete it with `value: null`.
   * `caller` must own the active name and sign.
   */
  async setRecord(
    nameInput: string,
    key: string,
    value: string | null,
    caller: string,
    options: RpcTxOptions = {},
  ): Promise<string> {
    const name = normalizeName(nameInput);
    assertValidName(name);
    return this.submitForHash(
      "set_record",
      [scValString(name), addressScVal(caller), scValString(key), scValOptionString(value ?? undefined)],
      caller,
      name,
      options,
    );
  }

  // ------------------------------------------------------------------
  // Plumbing
  // ------------------------------------------------------------------

  /**
   * Simulate a read-only contract invocation and decode its return value.
   * `subject` is the name (or address) the call is about, so contract errors
   * name it rather than the entrypoint.
   */
  private async callRead<T>(fn: string, args: xdr.ScVal[], subject: string): Promise<T> {
    const contract = new Contract(this.contractId);
    // The simulation result depends only on the invocation, not the source,
    // so a throwaway account keeps reads signer- and sequence-free.
    const source = new Account(SIMULATION_SOURCE, "0");
    const tx = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: this.passphrase,
    })
      .addOperation(contract.call(fn, ...args))
      .setTimeout(30)
      .build();

    const sim: SimulateResponse = await this.server.simulateTransaction(tx);
    if ("error" in sim && sim.error != null) {
      throw toContractError(sim.error, subject);
    }
    if (!("result" in sim) || sim.result?.retval == null) {
      throw new SideraError("EmptyResult", `No return value from "${fn}"`);
    }
    return scValToJs(sim.result.retval) as T;
  }

  /** Submit a write and return only its hash. */
  private async submitForHash(
    fn: string,
    args: xdr.ScVal[],
    source: string,
    name: string,
    options: RpcTxOptions,
  ): Promise<string> {
    return (await this.submit(fn, args, source, name, options)).hash;
  }

  /**
   * Build the invocation, simulate it to add its footprint, auth and resource
   * fees (`prepareTransaction`), sign via the configured signer, submit, and wait
   * until the network confirms it. Returns the hash and the decoded return value.
   */
  private async submit(
    fn: string,
    args: xdr.ScVal[],
    source: string,
    name: string,
    options: RpcTxOptions,
  ): Promise<{ hash: string; returnValue: unknown }> {
    const signer = this.signer;
    if (signer == null) {
      throw new SideraError(
        "NoSigner",
        "This client was constructed without a signer — write calls are unavailable",
      );
    }

    const contract = new Contract(this.contractId);
    const account = await this.server.getAccount(source);
    const tx = new TransactionBuilder(account, {
      fee: (options.fee ?? 100_000).toString(),
      networkPassphrase: this.passphrase,
    })
      .addOperation(contract.call(fn, ...args))
      .setTimeout(options.timeoutSeconds ?? 30)
      .build();

    // Soroban transactions need their storage footprint, authorization entries
    // and resource fee from a simulation before they can be submitted. A
    // contract error surfaces here, before anything is signed.
    let prepared: Transaction;
    try {
      prepared = (await this.server.prepareTransaction(tx)) as Transaction;
    } catch (err) {
      throw toContractError(err, name);
    }

    const signedXdr = await signer.signTx(prepared.toXDR(), this.passphrase);
    const signed = new Transaction(signedXdr, this.passphrase);
    const response: SendResponse = await this.server.sendTransaction(signed);
    if ("errorResult" in response && response.errorResult != null) {
      const code = extractContractCode(response.errorResult);
      throw code != null
        ? errorFromCode(code, name)
        : new SideraError("TxFailed", `Transaction failed: ${response.status}`);
    }
    if (response.status === "ERROR") {
      throw new SideraError("TxFailed", "The network rejected the transaction");
    }

    const result = await this.waitFor(response.hash);
    if (result.status === "SUCCESS") {
      const ret = "returnValue" in result ? result.returnValue : undefined;
      return { hash: response.hash, returnValue: ret == null ? null : scValToJs(ret) };
    }
    if (result.status === "FAILED") {
      const code = "resultXdr" in result && result.resultXdr != null
        ? extractContractCode(result.resultXdr)
        : null;
      throw code != null
        ? errorFromCode(code, name)
        : new SideraError("TxFailed", `Transaction ${response.hash} failed`);
    }
    throw new SideraError(
      "TxTimeout",
      `Transaction ${response.hash} was not confirmed in time; check it on an explorer`,
    );
  }

  /** Poll until the transaction leaves NOT_FOUND, or give up. */
  private async waitFor(hash: string): Promise<GetTxResponse> {
    let last: GetTxResponse = await this.server.getTransaction(hash);
    for (let i = 1; i < CONFIRM_ATTEMPTS && last.status === "NOT_FOUND"; i++) {
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_INTERVAL_MS));
      last = await this.server.getTransaction(hash);
    }
    return last;
  }
}

// --------------------------------------------------------------------
// ScVal helpers
// --------------------------------------------------------------------

/** Normalize and validate a subname label. */
function assertLabel(input: string): string {
  const label = input.trim().toLowerCase();
  const check = validateLabel(label);
  if (!check.ok) {
    throw new SideraError("InvalidName", `"${label}" is not a valid subname label: ${check.reason}`);
  }
  return label;
}

function scValString(value: string): xdr.ScVal {
  return xdr.ScVal.scvString(value);
}

/** G-/M-/C-address string → Address ScVal. Throws on invalid input. */
function addressScVal(value: string): xdr.ScVal {
  if (!value) {
    throw new SideraError("InvalidConfig", "address must be a non-empty string");
  }
  return new AddressC(value).toScVal();
}

/**
 * Soroban `Option<String>`: `None` is `Void` and `Some(s)` is the string itself.
 * (A vec here is rejected on-chain with `Error(WasmVm, InvalidAction)`.)
 */
function scValOptionString(value: string | undefined): xdr.ScVal {
  if (value == null) {
    return xdr.ScVal.scvVoid();
  }
  return scValString(value);
}

/** `years` as the contract's `u32`, checked client-side (1–10). */
function scValYears(years: number): xdr.ScVal {
  if (!Number.isInteger(years) || years < 1 || years > 10) {
    throw new SideraError("InvalidYears", "Years must be a whole number between 1 and 10");
  }
  return xdr.ScVal.scvU32(years);
}

/** Ledger timestamp (seconds) → Date. */
function secondsToDate(seconds: bigint | number): Date {
  return new Date(Number(seconds) * 1000);
}

/**
 * Minimal ScVal → JS decoder for the shapes this contract returns.
 * Deliberately not exhaustive — extend as the registry grows.
 */
function scValToJs(v: xdr.ScVal): unknown {
  switch (v.switch().name) {
    case "scvString":
      return v.str().toString();
    case "scvSymbol":
      return v.sym().toString();
    case "scvAddress":
      // Addresses decode to their strkey string form (G…/C…/M…).
      return AddressC.fromScVal(v).toString();
    case "scvBool":
      return v.b();
    case "scvU32":
      return v.u32();
    case "scvI32":
      return v.i32();
    case "scvU64":
    case "scvI64":
    case "scvU128":
    case "scvI128":
      return scValToBigInt(v);
    case "scvVoid":
      return null;
    case "scvVec":
      // A real Soroban Vec (Options are Void or the bare value, never a vec).
      return (v.vec() ?? []).map((item) => scValToJs(item));
    case "scvMap": {
      const map = v.map();
      const out: Record<string, unknown> = {};
      if (map != null) {
        for (const entry of map) {
          // Soroban Rust maps use Symbol keys for structs/enums; keep a
          // String-key fallback for robustness.
          const k = entry.key();
          const key =
            k.switch().name === "scvSymbol" ? k.sym().toString() : k.str().toString();
          out[key] = scValToJs(entry.val());
        }
      }
      // Rust sum types arrive as `{ Tag: "Variant", val: payload }` —
      // unwrap to the payload (e.g. `Resolution::Record { … }`).
      if (out.Tag != null && "val" in out) {
        return out.val;
      }
      return out;
    }
    default:
      return v.value();
  }
}
