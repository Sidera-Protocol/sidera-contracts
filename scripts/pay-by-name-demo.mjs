// Live proof of paying a .sid name that needs a memo, the way an exchange
// deposit works.
//
//  1. An "exchange" account registers `exchange-user` pointing at its own
//     address with the deposit memo 48151623 (the exchange's id for one user).
//  2. A memo that does not fit a Stellar text memo is refused by the registry.
//  3. Bob pays 10 XLM to `exchange-user.sid`. He never types an address or a
//     memo: the SDK resolves the name and `buildPayment` attaches the memo.
//  4. The transaction is read back from Horizon to show the destination,
//     amount and memo that actually landed on chain.
//
// Needs funded Stellar CLI identities sidera-bob and sidera-exchange
// (`stellar keys generate sidera-exchange --network testnet --fund`) and a
// built SDK:
//
//   CONTRACT=C... DEMO_NAME=exchange-user node scripts/pay-by-name-demo.mjs receipt.json
//
// Each transaction is signed by the Stellar CLI, so no secret key is read here.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { Horizon, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { SideraClient, buildPayment } from "../packages/sdk/dist/index.js";

const CONTRACT = process.env.CONTRACT;
const name = process.env.DEMO_NAME ?? "exchange-user";
const DEPOSIT_MEMO = process.env.DEPOSIT_MEMO ?? "48151623";
const AMOUNT = "10";
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");

const addr = (k) => execFileSync("stellar", ["keys", "address", k]).toString().trim();
const sign = (identity, txXdr) =>
  execFileSync("stellar", ["tx", "sign", "--sign-with-key", identity, "--network", "testnet"], { input: txXdr }).toString().trim();
const signerFor = (identity) => ({ signTx: async (txXdr) => sign(identity, txXdr) });

const EXCHANGE = addr("sidera-exchange"), BOB = addr("sidera-bob");
const asExchange = new SideraClient({ contractId: CONTRACT, network: "testnet", signer: signerFor("sidera-exchange") });
const asBob = new SideraClient({ contractId: CONTRACT, network: "testnet" });

const receipt = { network: "testnet", contractId: CONTRACT, sdk: "@sidera-protocol/sdk (packages/sdk)", steps: [] };
const step = (what, data) => { receipt.steps.push({ what, ...data }); console.log("✓", what, JSON.stringify(data)); };

const reg = await asExchange.register({ name, owner: EXCHANGE, address: EXCHANGE, memo: DEPOSIT_MEMO, years: 1 });
step("exchange registers a deposit name with a memo", { name: `${name}.sid`, hash: reg.hash, address: EXCHANGE, memo: DEPOSIT_MEMO });

try {
  await asExchange.register({ name: `${name}-long`, owner: EXCHANGE, address: EXCHANGE, memo: "x".repeat(29), years: 1 });
  step("UNEXPECTED: a 29-byte memo was stored", {});
} catch (e) {
  step("a memo longer than a Stellar text memo (28 bytes) is refused", { refusedWith: e.code ?? e.constructor.name, ok: e.code === "InvalidMemo" });
}

const resolved = await asBob.resolve(`${name}.sid`);
step("Bob resolves the name", { address: resolved.address, memo: resolved.memo });

const before = await horizon.loadAccount(EXCHANGE);
const startBalance = before.balances.find((b) => b.asset_type === "native").balance;
const tx = buildPayment({ source: await horizon.loadAccount(BOB), to: resolved, amount: AMOUNT, networkPassphrase: Networks.TESTNET });
const signed = TransactionBuilder.fromXDR(sign("sidera-bob", tx.toXDR()), Networks.TESTNET);
const sent = await horizon.submitTransaction(signed);

const onChain = await horizon.transactions().transaction(sent.hash).call();
const ops = await horizon.operations().forTransaction(sent.hash).call();
const pay = ops.records[0];
const after = await horizon.loadAccount(EXCHANGE);
const endBalance = after.balances.find((b) => b.asset_type === "native").balance;
step("Bob pays 10 XLM by name; the memo is attached for him", {
  hash: sent.hash,
  onChain: { destination: pay.to, amount: pay.amount, memoType: onChain.memo_type, memo: onChain.memo },
  exchangeBalance: { before: startBalance, after: endBalance },
  ok: pay.to === EXCHANGE && Number(pay.amount) === Number(AMOUNT) && onChain.memo_type === "id" && onChain.memo === DEPOSIT_MEMO,
});

writeFileSync(process.argv[2] ?? "pay-by-name-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log("receipt written");
