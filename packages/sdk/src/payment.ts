/**
 * Pay a resolved Sidera name. The memo hint is attached automatically, so a
 * wallet cannot forget it: building the payment *is* attaching the memo.
 */

import { Account, Asset, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { toStellarMemo } from "./memo.js";
import type { ResolutionResult } from "./types.js";

export interface PaymentParams {
  /** The paying account, with its current sequence number (e.g. from Horizon `loadAccount`). */
  source: Account;
  /** The result of `SideraClient.resolve` for the recipient name. */
  to: ResolutionResult;
  /** Amount as a decimal string, e.g. "10" or "2.5". */
  amount: string;
  /** Asset to send. Defaults to native XLM. */
  asset?: Asset;
  networkPassphrase: string;
  /** Fee in stroops. Defaults to 100. */
  fee?: string;
  timeoutSeconds?: number;
}

/**
 * Build an unsigned payment to a resolved name: destination = the resolved
 * G- or M-address, memo = the name's memo hint (if any). Sign and submit it
 * with your wallet and Horizon.
 */
export function buildPayment(params: PaymentParams): Transaction {
  return new TransactionBuilder(params.source, {
    fee: params.fee ?? "100",
    networkPassphrase: params.networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: params.to.address,
        asset: params.asset ?? Asset.native(),
        amount: params.amount,
      }),
    )
    .addMemo(toStellarMemo(params.to.memo))
    .setTimeout(params.timeoutSeconds ?? 120)
    .build();
}
