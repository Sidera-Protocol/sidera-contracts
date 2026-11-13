import { describe, expect, it } from "vitest";
import { SideraError } from "../src/errors.js";
import { parseMemoHint, toStellarMemo } from "../src/memo.js";

describe("parseMemoHint", () => {
  it("returns null only when there is no memo at all", () => {
    expect(parseMemoHint(null)).toBeNull();
    expect(parseMemoHint(undefined)).toBeNull();
    expect(parseMemoHint("")).toBeNull();
    // A stored memo of spaces is still a memo: send it exactly.
    expect(parseMemoHint("   ")).toEqual({ type: "text", value: "   " });
  });

  it("parses pure digit strings as MEMO_ID", () => {
    expect(parseMemoHint("1029384756")).toEqual({ type: "id", value: "1029384756" });
    expect(parseMemoHint("1")).toEqual({ type: "id", value: "1" });
  });

  it("parses alphanumeric strings as MEMO_TEXT", () => {
    expect(parseMemoHint("invoice-77")).toEqual({ type: "text", value: "invoice-77" });
    expect(parseMemoHint("alice-payment")).toEqual({ type: "text", value: "alice-payment" });
  });

  it("refuses a text memo past the 28-byte limit instead of shortening it", () => {
    expect(() => parseMemoHint("a".repeat(29))).toThrow(/longer than 28 bytes/);
    // 15 × 2-byte chars = 30 bytes: refused, never cut to fit.
    expect(() => parseMemoHint("é".repeat(15))).toThrow(SideraError);
    expect(parseMemoHint("a".repeat(28))).toEqual({ type: "text", value: "a".repeat(28) });
  });

  it("keeps leading zeros by sending the memo as text, exactly as stored", () => {
    expect(parseMemoHint("007")).toEqual({ type: "text", value: "007" });
    expect(parseMemoHint("0")).toEqual({ type: "id", value: "0" });
  });

  it("sends numbers that do not fit a u64 as text", () => {
    expect(parseMemoHint("18446744073709551615")).toEqual({ type: "id", value: "18446744073709551615" });
    expect(parseMemoHint("18446744073709551616")).toEqual({ type: "text", value: "18446744073709551616" });
  });

  it("never trims: surrounding spaces are part of a text memo", () => {
    expect(parseMemoHint(" 42 ")).toEqual({ type: "text", value: " 42 " });
  });

  it("maps absent hints to a none memo", () => {
    const memo = toStellarMemo(null);
    expect(memo.type).toBe("none");
  });

  it("maps id hints to MEMO_ID", () => {
    const memo = toStellarMemo({ type: "id", value: "1029384756" });
    expect(memo.type).toBe("id");
    expect(memo.value).toBe("1029384756");
  });

  it("maps text hints to MEMO_TEXT", () => {
    const memo = toStellarMemo({ type: "text", value: "hello" });
    expect(memo.type).toBe("text");
    expect(memo.value).toBe("hello");
  });
});
