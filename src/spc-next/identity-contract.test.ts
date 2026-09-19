import { describe, expect, it } from "vitest";
import {
  SPC_IDENTIFIER_MAX_LENGTH,
  assertSpcIdentifier,
  deriveSpcIdentifier,
  isSpcIdentifier,
} from "./identity-contract";

describe("SPC identifier contract", () => {
  it("keeps one shared 128-character transport/runtime bound", () => {
    expect(isSpcIdentifier("resident.mira:run-1")).toBe(true);
    expect(isSpcIdentifier("x".repeat(SPC_IDENTIFIER_MAX_LENGTH))).toBe(true);
    expect(isSpcIdentifier("x".repeat(SPC_IDENTIFIER_MAX_LENGTH + 1))).toBe(false);
    expect(isSpcIdentifier("bad id with spaces")).toBe(false);
    expect(() => assertSpcIdentifier("bad id with spaces", "test id")).toThrow(/bounded SPC identifier/);
  });

  it("derives deterministic compact ids without recursively embedding the source", () => {
    const longSource = "run.janek.causal.reason:"
      + "reason:resident.janek:sight:sight:actor_sight_enter:resident.janek:resident.mira:420.semantic-1";
    const first = deriveSpcIdentifier("task-outcome", longSource, "1335");
    const second = deriveSpcIdentifier("task-outcome", longSource, "1335");

    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(SPC_IDENTIFIER_MAX_LENGTH);
    expect(first).not.toContain(longSource);
    expect(deriveSpcIdentifier("task-outcome", `${longSource}:different`, "1335")).not.toBe(first);
  });
});
