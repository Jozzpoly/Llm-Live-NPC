import type { ResidentContinuityKernel } from "./resident-continuity-kernel";

/**
 * Resident-owned discovery scope for higher-life cognition.
 *
 * This is deliberately not a second continuity store. Matter existence, status and
 * evidence remain authoritative in ResidentContinuityKernel. The scope only remembers
 * which kernel matters belong to this resident's recovered life composition.
 *
 * Nonterminal matters stay visible. Terminal matters stay visible only while their
 * factual outcome remains in the kernel's bounded recent-evidence window, allowing
 * near-term reflection without creating an unbounded autobiographical archive.
 */
export class ResidentLifeMatterScope {
  private readonly tracked = new Set<string>();

  constructor(private readonly kernel: ResidentContinuityKernel) {}

  track(matterId: string): void {
    if (typeof matterId !== "string" || matterId.trim().length === 0) {
      throw new Error("resident life matter id must be non-empty");
    }
    if (!this.kernel.matter(matterId)) {
      throw new Error(`unknown resident life matter: ${matterId}`);
    }
    this.tracked.add(matterId);
  }

  matterIds(): string[] {
    const recentEvidenceIds = new Set(
      this.kernel.recentEvidenceSnapshot().map((evidence) => evidence.id),
    );
    const visible: string[] = [];

    for (const matterId of [...this.tracked]) {
      const matter = this.kernel.matter(matterId);
      if (!matter) {
        // Kernel matter deletion is not currently supported, but fail closed if that
        // ever changes instead of preserving a phantom life entry.
        this.tracked.delete(matterId);
        continue;
      }

      if (matter.status === "active" || matter.status === "suspended") {
        visible.push(matterId);
        continue;
      }

      const outcomeStillRecent = matter.lastOutcomeEvidenceId !== null
        && recentEvidenceIds.has(matter.lastOutcomeEvidenceId);
      if (outcomeStillRecent) {
        visible.push(matterId);
      } else {
        this.tracked.delete(matterId);
      }
    }

    return visible.sort((left, right) => left.localeCompare(right));
  }
}
