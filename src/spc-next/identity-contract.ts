export const SPC_IDENTIFIER_MAX_LENGTH = 128;

const SPC_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;

export function isSpcIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= SPC_IDENTIFIER_MAX_LENGTH
    && SPC_IDENTIFIER_PATTERN.test(value);
}

export function assertSpcIdentifier(value: string, label: string): void {
  if (!isSpcIdentifier(value)) {
    throw new Error(`${label} must be a bounded SPC identifier (1-${SPC_IDENTIFIER_MAX_LENGTH} ASCII-safe chars)`);
  }
}

/**
 * Build a compact deterministic identity from a potentially long existing identity.
 *
 * The source identity remains authoritative elsewhere; this helper is for secondary
 * derived records (for example factual outcome evidence) that must not recursively
 * embed the full source id and exceed the shared transport bound.
 */
export function deriveSpcIdentifier(
  prefix: string,
  sourceIdentity: string,
  suffix?: string,
): string {
  if (!isSpcIdentifier(prefix)) throw new Error("derived identifier prefix is invalid");
  if (typeof sourceIdentity !== "string" || sourceIdentity.length === 0) {
    throw new Error("derived identifier source must be non-empty");
  }
  if (suffix !== undefined && !isSpcIdentifier(suffix)) {
    throw new Error("derived identifier suffix is invalid");
  }

  const digest = stableIdentityDigest(sourceIdentity);
  const candidate = suffix === undefined
    ? `${prefix}:${digest}`
    : `${prefix}:${digest}:${suffix}`;
  assertSpcIdentifier(candidate, "derived identifier");
  return candidate;
}

function stableIdentityDigest(value: string): string {
  let hash = FNV64_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * FNV64_PRIME);
  }
  return hash.toString(16).padStart(16, "0");
}
