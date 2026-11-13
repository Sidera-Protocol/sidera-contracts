import { describe, expect, it } from "vitest";
import { errorFromCode, NameExpiredError, NameTakenError } from "../src/errors.js";

describe("errorFromCode", () => {
  it("maps every registry error code to a named error", () => {
    expect(errorFromCode(2, "alice")).toBeInstanceOf(NameTakenError);
    expect(errorFromCode(6, "alice")).toBeInstanceOf(NameExpiredError);
    expect(errorFromCode(10, "alice").code).toBe("TooManyNames");
    expect(errorFromCode(11, "alice").code).toBe("InvalidMemo");
  });

  it("keeps unknown codes visible instead of guessing", () => {
    expect(errorFromCode(99, "alice").code).toBe("Unknown(99)");
  });
});
