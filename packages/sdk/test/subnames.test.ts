import { beforeEach, describe, expect, it, vi } from "vitest";
import { Address, hash, Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import { SideraClient } from "../src/client.js";
import { InvalidNameError, NameNotFoundError, SideraError } from "../src/errors.js";

const OWNER = Keypair.random().publicKey();
const OTHER = Keypair.random().publicKey();
const CONTRACT_ID = StrKey.encodeContract(hash(Buffer.from("sidera-subnames-test")));

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: vi.fn(),
        getAccount: vi.fn(),
        sendTransaction: vi.fn(),
        prepareTransaction: vi.fn(async (tx: unknown) => tx),
        getTransaction: vi.fn(),
      })),
    },
  };
});

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const str = (s: string) => xdr.ScVal.scvString(s);
/** A `Resolution` exactly as the contract encodes it. */
const resolution = (address: string, memo: string | null) =>
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: sym("address"), val: new Address(address).toScVal() }),
    new xdr.ScMapEntry({ key: sym("memo"), val: memo == null ? xdr.ScVal.scvVoid() : str(memo) }),
  ]);
/** A Soroban `Map<String, V>`: String keys, ordered. */
const stringMap = (entries: Array<[string, xdr.ScVal]>) =>
  xdr.ScVal.scvMap(entries.map(([k, v]) => new xdr.ScMapEntry({ key: str(k), val: v })));

function reader(retval: xdr.ScVal) {
  const client = new SideraClient({ contractId: CONTRACT_ID, network: "testnet" });
  const server = (client as any).server;
  server.simulateTransaction.mockResolvedValue({ result: { retval } });
  return { client, server };
}

function writer() {
  const client = new SideraClient({
    contractId: CONTRACT_ID,
    network: "testnet",
    signer: { signTx: async (txXdr) => txXdr },
  });
  const server = (client as any).server;
  server.getAccount.mockResolvedValue({
    sequenceNumber: () => "1",
    accountId: () => OWNER,
    incrementSequenceNumber: () => {},
  });
  server.sendTransaction.mockResolvedValue({ hash: "tx123", status: "PENDING" });
  server.getTransaction.mockResolvedValue({ status: "SUCCESS", returnValue: xdr.ScVal.scvVoid() });
  return { client, server };
}

const call = (mock: any) => mock.mock.calls[0][0].operations[0].func.value();

describe("subnames", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves pay.alice.sid by sending the dotted name to the contract", async () => {
    const { client, server } = reader(resolution(OTHER, "48151623"));
    const r = await client.resolve("Pay.Alice.sid");
    expect(r).toMatchObject({ name: "pay.alice", fullName: "pay.alice.sid", address: OTHER });
    expect(r.memo).toEqual({ type: "id", value: "48151623" });
    const hf = call(server.simulateTransaction);
    expect(hf.functionName().toString()).toBe("resolve");
    expect(hf.args()[0].str().toString()).toBe("pay.alice");
  });

  it("refuses malformed subnames before any RPC", async () => {
    const { client, server } = reader(xdr.ScVal.scvVoid());
    await expect(client.resolve("a.b.alice")).rejects.toBeInstanceOf(InvalidNameError);
    await expect(client.resolve("pay-.alice")).rejects.toBeInstanceOf(InvalidNameError);
    expect(server.simulateTransaction).not.toHaveBeenCalled();
  });

  it("maps a missing subname to NameNotFoundError", async () => {
    const { client, server } = reader(xdr.ScVal.scvVoid());
    server.simulateTransaction.mockResolvedValue({ error: "HostError: Error(Contract, #1)" });
    await expect(client.resolve("nope.alice")).rejects.toBeInstanceOf(NameNotFoundError);
  });

  it("decodes every subname with its parsed memo", async () => {
    const { client, server } = reader(
      stringMap([
        ["pay", resolution(OTHER, "007")],
        ["savings", resolution(OWNER, null)],
      ]),
    );
    await expect(client.subnames("alice.sid")).resolves.toEqual([
      { label: "pay", fullName: "pay.alice.sid", address: OTHER, memo: { type: "text", value: "007" } },
      { label: "savings", fullName: "savings.alice.sid", address: OWNER, memo: null },
    ]);
    const hf = call(server.simulateTransaction);
    expect(hf.functionName().toString()).toBe("subnames");
    expect(hf.args()[0].str().toString()).toBe("alice");
  });

  it("builds set_subname with parent, label, caller, address and the memo as an Option", async () => {
    const { client, server } = writer();
    await client.setSubname({ parent: "alice", label: "Pay", address: OTHER, memo: "42" }, OWNER);
    const hf = call(server.sendTransaction);
    expect(hf.functionName().toString()).toBe("set_subname");
    const [parent, label, caller, address, memo] = hf.args();
    expect(parent.str().toString()).toBe("alice");
    expect(label.str().toString()).toBe("pay");
    expect(Address.fromScVal(caller).toString()).toBe(OWNER);
    expect(Address.fromScVal(address).toString()).toBe(OTHER);
    expect(memo.str().toString()).toBe("42");
  });

  it("builds remove_subname and refuses bad labels before any RPC", async () => {
    const { client, server } = writer();
    await expect(client.removeSubname("alice", "-x", OWNER)).rejects.toBeInstanceOf(SideraError);
    expect(server.sendTransaction).not.toHaveBeenCalled();
    await client.removeSubname("alice", "pay", OWNER);
    const hf = call(server.sendTransaction);
    expect(hf.functionName().toString()).toBe("remove_subname");
    expect(hf.args().map((a: xdr.ScVal) => a.switch().name)).toEqual(["scvString", "scvString", "scvAddress"]);
  });
});

describe("profile records", () => {
  beforeEach(() => vi.clearAllMocks());

  it("decodes records into a plain object", async () => {
    const { client } = reader(stringMap([["avatar", str("https://img/a.png")], ["com.github", str("alice")]]));
    await expect(client.records("alice")).resolves.toEqual({ avatar: "https://img/a.png", "com.github": "alice" });
  });

  it("returns no records for an empty map", async () => {
    const { client } = reader(xdr.ScVal.scvMap([]));
    await expect(client.records("alice")).resolves.toEqual({});
  });

  it("sets a record, and deletes one by sending Void", async () => {
    const { client, server } = writer();
    await client.setRecord("alice", "url", "https://alice.example", OWNER);
    let [, , key, value] = call(server.sendTransaction).args();
    expect(key.str().toString()).toBe("url");
    expect(value.str().toString()).toBe("https://alice.example");

    server.sendTransaction.mockClear();
    await client.setRecord("alice", "url", null, OWNER);
    [, , key, value] = call(server.sendTransaction).args();
    expect(value.switch().name).toBe("scvVoid");
  });

  it("maps contract error #12 to InvalidRecord", async () => {
    const { client, server } = writer();
    server.prepareTransaction.mockRejectedValue(new Error("HostError: Error(Contract, #12)"));
    await expect(client.setRecord("alice", "Bad Key", "x", OWNER)).rejects.toMatchObject({ code: "InvalidRecord" });
  });
});
