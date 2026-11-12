/**
 * SideraClient — the single entry point wallets and payment apps use to
 * talk to a deployed Sidera registry over Soroban RPC.
 *
 * Read calls (`resolve`, `ownerOf`, `exists`, `primaryName`) simulate the invocation and
 * decode the result. Write calls (`register`, `setAddress`, `transfer`, `setPrimaryName`)
 * build, sign (via the configured signer), and submit real transactions.
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
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { errorFromCode, SideraError } from "./errors.js";
import { assertValidName, normalizeName } from "./names.js";
import { parseMemoHint } from "./memo.js";
import type {
  ParsedMemo,
  RegisterParams,
  ResolutionResult,
  RpcTxOptions,
  SideraConfig,
  SideraSigner,
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
   * Resolve a name into a full payment destination: address and parsed
   * memo hint. Accepts bare names or `name.sid` input.
   *
   * @throws `NameNotFoundError` when the name is not registered.
   */
  async resolve(nameInput: string): Promise<ResolutionResult> {
    const name = normalizeName(nameInput);
    assertValidName(name);

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
   * Register `params.name` for `params.owner`. Builds, signs via the
   * configured signer, and submits the transaction; returns its hash.
   *
   * @throws `NameTakenError` when the name is already registered.
   * @throws `InvalidNameError` when validation fails on- or off-chain.
   */
  async register(params: RegisterParams, options: RpcTxOptions = {}): Promise<string> {
    const name = normalizeName(params.name);
    assertValidName(name);
    return this.submit(
      "register",
      [
        scValString(name),
        addressScVal(params.owner),
        addressScVal(params.address),
        scValOptionString(params.memo),
      ],
      params.owner,
      name,
      options,
    );
  }

  /** Transfer a name to a new owner. Returns the submitted tx hash. */
  async transfer(params: TransferParams, options: RpcTxOptions = {}): Promise<string> {
    const name = normalizeName(params.name);
    assertValidName(name);
    return this.submit(
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
    return this.submit(
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
    return this.submit(
      "set_primary_name",
      [addressScVal(address), scValString(name)],
      address,
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

  /** Build, sign via the configured signer, and submit a transaction. */
  private async submit(
    fn: string,
    args: xdr.ScVal[],
    source: string,
    name: string,
    options: RpcTxOptions,
  ): Promise<string> {
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

    const signedXdr = await signer.signTx(tx.toXDR(), this.passphrase);
    const signed = new Transaction(signedXdr, this.passphrase);
    const response: SendResponse = await this.server.sendTransaction(signed);
    if ("errorResult" in response && response.errorResult != null) {
      const code = extractContractCode(response.errorResult);
      throw code != null
        ? errorFromCode(code, name)
        : new SideraError("TxFailed", `Transaction failed: ${response.status}`);
    }
    return response.hash;
  }
}

// --------------------------------------------------------------------
// ScVal helpers
// --------------------------------------------------------------------

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

/** Soroban `Option<String>`: `Some` is a 1-element vec, `None` an empty one. */
function scValOptionString(value: string | undefined): xdr.ScVal {
  if (value == null) {
    return xdr.ScVal.scvVec([]);
  }
  return xdr.ScVal.scvVec([scValString(value)]);
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
      return BigInt(v.u64().toString());
    case "scvVoid":
      return null;
    case "scvVec": {
      // Option<T> decoding: 0 elements → null, 1 element → decoded value.
      const vec = v.vec();
      if (vec == null || vec.length === 0) {
        return null;
      }
      return scValToJs(vec[0]!);
    }
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
