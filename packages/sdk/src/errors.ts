/**
 * Typed errors mirroring the on-chain `RegistryError` enum (codes 1–9) plus
 * client-side failures. Mapping contract errors to classes keeps wallet and
 * app code off string matching.
 */
export class SideraError extends Error {
  /** Machine-readable error code. */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SideraError";
    this.code = code;
  }
}

export class NameNotFoundError extends SideraError {
  constructor(name: string) {
    super("NotFound", `Name "${name}" is not registered (or was released after expiring)`);
  }
}

export class NameTakenError extends SideraError {
  constructor(name: string) {
    super("NameTaken", `Name "${name}" is already registered`);
  }
}

export class InvalidNameError extends SideraError {
  constructor(name: string, reason: string) {
    super("InvalidName", `Name "${name}" is invalid: ${reason}`);
  }
}

export class UnauthorizedError extends SideraError {
  constructor(name: string) {
    super("Unauthorized", `Caller is not the owner of "${name}"`);
  }
}

/** The name has expired: it no longer resolves and can only be renewed. */
export class NameExpiredError extends SideraError {
  constructor(name: string) {
    super("NameExpired", `Name "${name}" has expired; it can be renewed during the grace period`);
  }
}

/** Map an on-chain error code (1–9) to a typed error. */
export function errorFromCode(code: number, name: string): SideraError {
  switch (code) {
    case 1:
      return new NameNotFoundError(name);
    case 2:
      return new NameTakenError(name);
    case 3:
      return new InvalidNameError(name, "rejected by the registry");
    case 4:
      return new UnauthorizedError(name);
    case 5:
      return new SideraError("ArithmeticOverflow", "Contract arithmetic overflow");
    case 6:
      return new NameExpiredError(name);
    case 7:
      return new SideraError("InvalidYears", "Years must be between 1 and 10");
    case 8:
      return new SideraError("InvalidPrice", "Prices must not be negative");
    case 9:
      return new SideraError("PeriodTooLong", `Renewing "${name}" would go more than 10 years ahead`);
    default:
      return new SideraError(`Unknown(${code})`, `Contract error ${code}`);
  }
}
