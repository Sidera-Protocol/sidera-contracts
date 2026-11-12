import { describe, expect, it } from "vitest";
import { assertValidName, NAME_MAX_LEN, NAME_MIN_LEN, normalizeName, validateName } from "../src/names.js";
import { InvalidNameError } from "../src/errors.js";

describe("validateName", () => {
  it("accepts valid names", () => {
    for (const name of ["alice", "bob99", "alice-pay", "a-b-c", "x".repeat(NAME_MAX_LEN)]) {
      expect(validateName(name)).toEqual({ ok: true });
    }
  });

  it("rejects names shorter than the minimum", () => {
    const check = validateName("ab");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("too short");
  });

  it("rejects names longer than the maximum", () => {
    const check = validateName("a".repeat(NAME_MAX_LEN + 1));
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("too long");
  });

  it("rejects uppercase, spaces, dots, and symbols", () => {
    for (const name of ["Alice", "al ice", "al.ice", "ali$e", "al/ice"]) {
      expect(validateName(name).ok).toBe(false);
    }
  });

  it("rejects leading and trailing hyphens", () => {
    expect(validateName("-alice").ok).toBe(false);
    expect(validateName("alice-").ok).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(validateName("").ok).toBe(false);
  });
});

describe("assertValidName", () => {
  it("passes for valid names", () => {
    expect(() => assertValidName("alice")).not.toThrow();
  });

  it("throws InvalidNameError with the reason for invalid names", () => {
    try {
      assertValidName("-bad");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidNameError);
      expect((err as InvalidNameError).code).toBe("InvalidName");
    }
  });
});

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  Alice ")).toBe("alice");
  });

  it("strips the .sid suffix", () => {
    expect(normalizeName("alice.sid")).toBe("alice");
    expect(normalizeName("Alice.SID")).toBe("alice");
  });

  it("leaves bare names untouched", () => {
    expect(normalizeName("alice")).toBe("alice");
  });
});
