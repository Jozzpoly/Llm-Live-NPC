import type { KnownActorContext } from "./cognition-contract";
import { distanceSquared, normalizedDirection, type Vec2, type WorldOccurrence } from "./contracts";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

export type ResidentActorContactReader = (actorId: string) => KnownActorContext | null;

export type ResidentMessageDeliveryStep =
  | {
      status: "running";
      runId: string;
      phase: "approach";
      recipientId: string;
      targetPosition: Vec2;
      recipientCurrentlyVisible: boolean;
    }
  | {
      status: "delivered";
      runId: string;
      recipientId: string;
      occurrence: WorldOccurrence;
    }
  | {
      status: "blocked";
      runId: string;
      recipientId: string;
      reason: "recipient_contact_unknown" | "recipient_absent_at_best_known_contact" | "speech_not_emitted";
    }
  | { status: "authority_lost"; runId: string; recipientId: string };

const DEFAULT_APPROACH_SPEED = 95;
const DEFAULT_COMMUNICATION_DISTANCE = 80;
const DEFAULT_SPEECH_RADIUS = 220;
const CONTACT_POINT_TOLERANCE = 14;

/**
 * Resident-local execution of an already-accepted message commitment.
 *
 * The executor never asks World where the recipient currently is. Its only target
 * information comes from a resident-private contact reader. Current World truth is
 * used solely for the executing resident's own body state. If the recipient is not
 * visible, Ida may approach only the best position she actually remembers; reaching
 * that point without renewed sight produces pressure rather than oracle tracking.
 *
 * Delivery itself is a real run-authorized World speech occurrence. This class does
 * not claim that the recipient understood, believed or accepted anything merely
 * because speech was emitted.
 */
export class ResidentMessageDeliveryExecutor {
  private terminal: ResidentMessageDeliveryStep | null = null;

  constructor(
    readonly runId: string,
    readonly recipientId: string,
    readonly messageText: string,
    private readonly readContact: ResidentActorContactReader,
    private readonly authority: ResidentWorldExecutionAuthority,
    private readonly world: SpcWorldRuntime,
    private readonly approachSpeed = DEFAULT_APPROACH_SPEED,
    private readonly communicationDistance = DEFAULT_COMMUNICATION_DISTANCE,
    private readonly speechRadius = DEFAULT_SPEECH_RADIUS,
  ) {
    if (!runId.trim()) throw new Error("message delivery runId must be non-empty");
    if (!recipientId.trim()) throw new Error("message delivery recipientId must be non-empty");
    if (!messageText.trim()) throw new Error("message delivery text must be non-empty");
    for (const [name, value] of [
      ["approachSpeed", approachSpeed],
      ["communicationDistance", communicationDistance],
      ["speechRadius", speechRadius],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`);
    }
    if (speechRadius < communicationDistance) {
      throw new Error("message delivery speechRadius must cover communicationDistance");
    }
  }

  step(): ResidentMessageDeliveryStep {
    if (this.terminal) return structuredClone(this.terminal);

    const self = this.world.publicSnapshot().actors.find((actor) => actor.id === this.authority.residentId);
    if (!self) return this.finishAuthorityLost();

    const contact = this.readContact(this.recipientId);
    if (!contact?.lastKnownPosition) {
      return this.finishBlocked("recipient_contact_unknown");
    }

    const targetPosition = { ...contact.lastKnownPosition };
    const distanceToContactSquared = distanceSquared(self.position, targetPosition);

    if (contact.currentlyVisible && distanceToContactSquared <= this.communicationDistance ** 2) {
      const direction = normalizedDirection(self.position, targetPosition);
      const effects = [
        { kind: "motion" as const, desiredVelocity: { x: 0, y: 0 } },
        ...(Math.hypot(direction.x, direction.y) > 1e-9
          ? [{ kind: "look" as const, direction }]
          : []),
        {
          kind: "speech" as const,
          text: this.messageText,
          radius: this.speechRadius,
          addressedActorIds: [this.recipientId],
        },
      ];
      const applied = this.authority.apply({ runId: this.runId, effects });
      if (applied.status !== "applied") return this.finishAuthorityLost();
      const occurrence = applied.occurrences.find((candidate) => (
        candidate.kind === "speech"
        && candidate.text === this.messageText
        && candidate.addressedActorIds.includes(this.recipientId)
      ));
      if (!occurrence) return this.finishBlocked("speech_not_emitted");
      this.terminal = {
        status: "delivered",
        runId: this.runId,
        recipientId: this.recipientId,
        occurrence: structuredClone(occurrence),
      };
      return structuredClone(this.terminal);
    }

    if (!contact.currentlyVisible && distanceToContactSquared <= CONTACT_POINT_TOLERANCE ** 2) {
      const stopped = this.authority.apply({
        runId: this.runId,
        effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
      });
      if (stopped.status !== "applied") return this.finishAuthorityLost();
      return this.finishBlocked("recipient_absent_at_best_known_contact", false);
    }

    const direction = normalizedDirection(self.position, targetPosition);
    const speed = Math.min(self.maxSpeed, this.approachSpeed);
    const applied = this.authority.apply({
      runId: this.runId,
      effects: [{
        kind: "motion",
        desiredVelocity: { x: direction.x * speed, y: direction.y * speed },
      }],
    });
    if (applied.status !== "applied") return this.finishAuthorityLost();

    return {
      status: "running",
      runId: this.runId,
      phase: "approach",
      recipientId: this.recipientId,
      targetPosition,
      recipientCurrentlyVisible: contact.currentlyVisible,
    };
  }

  private finishBlocked(
    reason: Extract<ResidentMessageDeliveryStep, { status: "blocked" }>["reason"],
    stop = true,
  ): ResidentMessageDeliveryStep {
    if (stop) {
      const stopped = this.authority.apply({
        runId: this.runId,
        effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
      });
      if (stopped.status !== "applied") return this.finishAuthorityLost();
    }
    this.terminal = { status: "blocked", runId: this.runId, recipientId: this.recipientId, reason };
    return structuredClone(this.terminal);
  }

  private finishAuthorityLost(): ResidentMessageDeliveryStep {
    this.terminal = { status: "authority_lost", runId: this.runId, recipientId: this.recipientId };
    return structuredClone(this.terminal);
  }
}
