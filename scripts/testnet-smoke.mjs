// End-to-end smoke test of a deployed Sidera registry, driven by the SDK.
//
// Registers a name for 2 years, resolves it, renews it from a second account,
// sets a primary name, lists the owner's names, and checks that an impostor's primary-name claim and a
// duplicate registration are refused. Writes a receipt with every transaction.
//
// Needs four funded Stellar CLI identities (sidera-admin, sidera-treasury,
// sidera-alice, sidera-bob) and a built SDK (`npm run build -w @sidera-protocol/sdk`):
//
//   CONTRACT=C... XLM=$(stellar contract id asset --asset native --network testnet) \
//   SMOKE_NAME=my-test-name node scripts/testnet-smoke.mjs receipt.json
//
// Each transaction is signed by the Stellar CLI, so no secret key is read here.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { SideraClient, NameTakenError, UnauthorizedError } from "../packages/sdk/dist/index.js";

const CONTRACT = process.env.CONTRACT;
const XLM = process.env.XLM;
const addr = (k) => execFileSync("stellar", ["keys", "address", k]).toString().trim();
const signerFor = (identity) => ({
  signTx: async (txXdr) =>
    execFileSync("stellar", ["tx", "sign", "--sign-with-key", identity, "--network", "testnet"], { input: txXdr }).toString().trim(),
});
const xlmBalance = (who) => {
  const out = execFileSync("stellar", ["contract", "invoke", "--id", XLM, "--source", "sidera-admin", "--network", "testnet", "--send", "no", "--", "balance", "--id", who]).toString().trim();
  return BigInt(out.replace(/"/g, ""));
};
const ALICE = addr("sidera-alice"), BOB = addr("sidera-bob"), TREASURY = addr("sidera-treasury");
const asAlice = new SideraClient({ contractId: CONTRACT, network: "testnet", signer: signerFor("sidera-alice") });
const asBob = new SideraClient({ contractId: CONTRACT, network: "testnet", signer: signerFor("sidera-bob") });
const name = process.env.SMOKE_NAME ?? "alice-pay";
const receipt = { network: "testnet", contractId: CONTRACT, paymentToken: XLM, sdk: "@sidera-protocol/sdk (packages/sdk)", steps: [] };
const step = (what, data) => { receipt.steps.push({ what, ...data }); console.log("✓", what, JSON.stringify(data, (k, v) => typeof v === "bigint" ? v.toString() : v)); };

const cfg = await asAlice.config();
step("config", { treasury: cfg.treasury, prices: cfg.prices });
step("price quotes (stroops)", { "abc 1y": await asAlice.price("abc", 1), "abcd 1y": await asAlice.price("abcd", 1), [`${name} 2y`]: await asAlice.price(name, 2) });
step("available before registering", { name, available: await asAlice.isAvailable(name) });

const t0 = xlmBalance(TREASURY);
const reg = await asAlice.register({ name, owner: ALICE, address: ALICE, memo: "1029384756", years: 2 });
const t1 = xlmBalance(TREASURY);
step("register 2 years, paid by owner", { hash: reg.hash, expiresAt: reg.expiresAt.toISOString(), treasuryReceived: t1 - t0 });

const res = await asBob.resolve(`${name}.sid`);
step("resolve (address + memo)", { address: res.address, memo: res.memo });

const ren = await asBob.renew({ name, payer: BOB, years: 1 });
const t2 = xlmBalance(TREASURY);
step("renew 1 year, paid by someone else", { hash: ren.hash, expiresAt: ren.expiresAt.toISOString(), treasuryReceived: t2 - t1, ownerUnchanged: (await asBob.ownerOf(name)) === ALICE });

const prim = await asAlice.setPrimaryName(ALICE, name);
step("set primary name (owner, resolves to owner)", { hash: prim, primaryName: await asAlice.primaryName(ALICE) });

try { await asBob.setPrimaryName(BOB, name); step("UNEXPECTED: impostor primary name accepted", {}); }
catch (e) { step("impostor cannot claim someone else's name as primary", { refusedWith: e.constructor.name, ok: e instanceof UnauthorizedError }); }

try { await asBob.register({ name, owner: BOB, address: BOB }); step("UNEXPECTED: duplicate register accepted", {}); }
catch (e) { step("taken name cannot be registered again", { refusedWith: e.constructor.name, ok: e instanceof NameTakenError }); }

const held = await asBob.namesOf(ALICE);
step("names held by the owner, read from the registry", { names: held.map((n) => ({ name: n.name, expiresAt: n.expiresAt.toISOString() })), includesName: held.some((n) => n.name === name) });

step("expiry read back", { expiresAt: (await asAlice.expiresAt(name)).toISOString(), available: await asAlice.isAvailable(name) });
writeFileSync(process.argv[2] ?? "testnet-smoke-output.json", JSON.stringify(receipt, (k, v) => typeof v === "bigint" ? v.toString() : v, 2));
console.log("receipt written");
