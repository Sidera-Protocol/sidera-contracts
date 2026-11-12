/**
 * Demo-mode registry data. Shaped exactly like on-chain records so the UI
 * path is identical between demo and live modes.
 */
import type { ParsedMemo } from "@sidera-protocol/sdk";

export interface MockRecord {
  owner: string;
  address: string;
  memo: ParsedMemo | null;
}

const DEMO_ADDRESS_1 = "GA7XNCNQTFA4VD2KVGSPW7N3A57XNCNQTFA4VD2KVGSPW7N3A57XNQC";
const DEMO_ADDRESS_2 = "GBBCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCM4U";
const DEMO_ADDRESS_3 = "GDEYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYA5T";

export const DEMO_OWNER = DEMO_ADDRESS_1;

export const MOCK_REGISTRY: Record<string, MockRecord> = {
  alice: { owner: DEMO_ADDRESS_1, address: DEMO_ADDRESS_1, memo: null },
  bob: { owner: DEMO_ADDRESS_2, address: DEMO_ADDRESS_2, memo: { type: "id", value: "1029384756" } },
  "sidera-labs": { owner: DEMO_ADDRESS_3, address: DEMO_ADDRESS_2, memo: { type: "text", value: "invoice-77" } },
  carol: { owner: DEMO_ADDRESS_3, address: DEMO_ADDRESS_3, memo: null },
  "stellar-pay": { owner: DEMO_ADDRESS_2, address: DEMO_ADDRESS_2, memo: { type: "id", value: "42" } },
};
