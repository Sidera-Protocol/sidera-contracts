// Live proof of subnames and profile records on a deployed Sidera registry.
//
//  1. An exchange registers `demo-exchange` and gives two customers their own
//     deposit names, `alice.demo-exchange` (memo 1001) and
//     `bob.demo-exchange` (memo 1002), plus a public profile.
//  2. Someone who does not own `demo-exchange` cannot add a subname.
//  3. Bob pays 5 XLM to `alice.demo-exchange.sid`; Horizon shows the payment
//     went to the exchange with memo 1001, Alice's customer number.
//  4. A deleted subname stops resolving.
//  5. A name registered before this upgrade (`alice-pay`) takes subnames too.
//
// Needs funded Stellar CLI identities sidera-exchange, sidera-alice and
// sidera-bob, and a built SDK:
//
//   CONTRACT=C... node scripts/subnames-demo.mjs receipt.json
//
// Each transaction is signed by the Stellar CLI, so no secret key is read here.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { Horizon, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { SideraClient, buildPayment } from "../packages/sdk/dist/index.js";

const CONTRACT = process.env.CONTRACT;
const PARENT = process.env.PARENT ?? "demo-exchange";
const LEGACY = process.env.LEGACY ?? "alice-pay";
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");

const addr = (k) => execFileSync("stellar", ["keys", "address", k]).toString().trim();
const sign = (identity, txXdr) =>
  execFileSync("stellar", ["tx", "sign", "--sign-with-key", identity, "--network", "testnet"], { input: txXdr }).toString().trim();
const as = (identity) =>
  new SideraClient({ contractId: CONTRACT, network: "testnet", signer: { signTx: async (x) => sign(identity, x) } });

const EXCHANGE = addr("sidera-exchange"), ALICE = addr("sidera-alice"), BOB = addr("sidera-bob");
const exchange = as("sidera-exchange"), alice = as("sidera-alice"), bob = as("sidera-bob");

const receipt = { network: "testnet", contractId: CONTRACT, sdk: "@sidera-protocol/sdk (packages/sdk)", steps: [] };
const step = (what, data) => { receipt.steps.push({ what, ...data }); console.log("✓", what, JSON.stringify(data)); };

const reg = await exchange.register({ name: PARENT, owner: EXCHANGE, address: EXCHANGE, years: 1 });
step("exchange registers its name", { name: `${PARENT}.sid`, hash: reg.hash });

const h1 = await exchange.setSubname({ parent: PARENT, label: "alice", address: EXCHANGE, memo: "1001" }, EXCHANGE);
const h2 = await exchange.setSubname({ parent: PARENT, label: "bob", address: EXCHANGE, memo: "1002" }, EXCHANGE);
step("exchange creates one deposit subname per customer", { hashes: [h1, h2] });

const r1 = await exchange.setRecord(PARENT, "url", "https://exchange.example", EXCHANGE);
const r2 = await exchange.setRecord(PARENT, "description", "Sidera demo exchange (testnet)", EXCHANGE);
step("exchange publishes its profile", { hashes: [r1, r2], records: await bob.records(PARENT) });

const subs = await bob.subnames(PARENT);
step("anyone can list the subnames", { subnames: subs.map((s) => ({ name: s.fullName, memo: s.memo })) });

try {
  await bob.setSubname({ parent: PARENT, label: "mallory", address: BOB }, BOB);
  step("UNEXPECTED: a non-owner created a subname", {});
} catch (e) {
  step("someone who does not own the parent cannot add a subname", { refusedWith: e.code ?? e.constructor.name, ok: e.code === "Unauthorized" });
}

const to = await bob.resolve(`alice.${PARENT}.sid`);
const tx = buildPayment({ source: await horizon.loadAccount(BOB), to, amount: "5", networkPassphrase: Networks.TESTNET });
const sent = await horizon.submitTransaction(TransactionBuilder.fromXDR(sign("sidera-bob", tx.toXDR()), Networks.TESTNET));
const onChain = await horizon.transactions().transaction(sent.hash).call();
const pay = (await horizon.operations().forTransaction(sent.hash).call()).records[0];
step("Bob pays 5 XLM to a subname; its memo is attached for him", {
  name: `alice.${PARENT}.sid`,
  hash: sent.hash,
  onChain: { destination: pay.to, amount: pay.amount, memoType: onChain.memo_type, memo: onChain.memo },
  ok: pay.to === EXCHANGE && onChain.memo_type === "id" && onChain.memo === "1001",
});

const rm = await exchange.removeSubname(PARENT, "bob", EXCHANGE);
let gone = false;
try { await bob.resolve(`bob.${PARENT}`); } catch (e) { gone = e.code === "NotFound"; }
step("a deleted subname stops resolving", { hash: rm, ok: gone });

const legacy = await alice.setSubname({ parent: LEGACY, label: "pay", address: ALICE, memo: "77" }, ALICE);
const legacyResolved = await bob.resolve(`pay.${LEGACY}`);
step("a name registered before the upgrade takes subnames", {
  name: `pay.${LEGACY}.sid`,
  hash: legacy,
  resolved: { address: legacyResolved.address, memo: legacyResolved.memo },
  ok: legacyResolved.address === ALICE,
});

writeFileSync(process.argv[2] ?? "subnames-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log("receipt written");
