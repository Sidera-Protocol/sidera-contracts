import { describe, expect, it } from "vitest";
import { parseMemoHint, toStellarMemo } from "../src/memo.js";

describe("parseMemoHint", () => {
  it("returns null for absent or blank hints", () => {
    expect(parseMemoHint(null)).toBeNull();
    expect(parseMemoHint(undefined)).toBeNull();
    expect(parseMemoHint("")).toBeNull();
    expect(parseMemoHint("   ")).toBeNull();
  });

  it("parses pure digit strings as MEMO_ID", () => {
    expect(parseMemoHint("1029384756")).toEqual({ type: "id", value: "1029384756" });
    expect(parseMemoHint("1")).toEqual({ type: "id", value: "1" });
    expect(parseMemoHint(" 42 ")).toEqual({ type: "id", value: "42" });
  });

  it("parses alphanumeric strings as MEMO_TEXT", () => {
    expect(parseMemoHint("invoice-77")).toEqual({ type: "text", value: "invoice-77" });
    expect(parseMemoHint("alice-payment")).toEqual({ type: "text", value: "alice-payment" });
  });

  it("truncates text memos past the 28-byte Stellar limit", () => {
    const long = "a".repeat(40);
    const parsed = parseMemoHint(long);
    expect(parsed?.type).toBe("text");
    expect(parsed?.value.length).toBe(28);
  });

  it("keeps multi-byte text within the 28-byte limit", () => {
    // 20 × 2-byte chars = 40 bytes → truncated to 14 chars (28 bytes).
    const parsed = parseMemoHint("é".repeat(20));
    expect(parsed?.type).toBe("text");
    expect(Buffer.byteLength(parsed?.value ?? "", "utf8")).toBeLessThanOrEqual(28);
  });

  it("treats leading-zero digit strings as IDs (exchange convention)", () => {
    expect(parseMemoHint("000123")).toEqual({ type: "id", value: "000123" });
  });
});

describe("toStellarMemo", () => {
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
