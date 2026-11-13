import { describe, expect, it } from "vitest";
import { Account, Asset, Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import { buildPayment } from "../src/payment.js";
import type { ResolutionResult } from "../src/types.js";

const SOURCE = new Account(Keypair.random().publicKey(), "41");
const EXCHANGE = Keypair.random().publicKey();

function resolved(memo: ResolutionResult["memo"], address = EXCHANGE): ResolutionResult {
  return { name: "exchange-user", fullName: "exchange-user.sid", address, memo };
}

describe("buildPayment", () => {
  it("pays the resolved address and attaches an ID memo", () => {
    const tx = buildPayment({
      source: SOURCE,
      to: resolved({ type: "id", value: "48151623" }),
      amount: "10",
      networkPassphrase: Networks.TESTNET,
    });
    const op = tx.operations[0] as { type: string; destination: string; amount: string; asset: Asset };
    expect(op.type).toBe("payment");
    expect(op.destination).toBe(EXCHANGE);
    expect(op.amount).toBe("10.0000000");
    expect(op.asset.isNative()).toBe(true);
    expect(tx.memo.type).toBe("id");
    expect(tx.memo.value).toBe("48151623");
  });

  it("attaches a text memo byte for byte", () => {
    const tx = buildPayment({
      source: SOURCE,
      to: resolved({ type: "text", value: "007" }),
      amount: "1",
      networkPassphrase: Networks.TESTNET,
    });
    expect(tx.memo.type).toBe("text");
    expect(tx.memo.value?.toString()).toBe("007");
  });

  it("sends no memo when the name has none", () => {
    const tx = buildPayment({ source: SOURCE, to: resolved(null), amount: "1", networkPassphrase: Networks.TESTNET });
    expect(tx.memo.type).toBe("none");
  });

  it("pays a muxed (M-) address as-is", () => {
    const muxed = StrKey.encodeMed25519PublicKey(
      Buffer.concat([StrKey.decodeEd25519PublicKey(EXCHANGE), Buffer.from([0, 0, 0, 0, 0, 0, 0, 7])]),
    );
    const tx = buildPayment({ source: SOURCE, to: resolved(null, muxed), amount: "1", networkPassphrase: Networks.TESTNET });
    expect((tx.operations[0] as { destination: string }).destination).toBe(muxed);
  });
});
