import { PlayerControlBuffer } from "./player-control-buffer";

interface Point {
  x: number;
  y: number;
}

interface TapCandidate {
  start: Point;
  startedAt: number;
  cancelled: boolean;
}

const TAP_MAX_TRAVEL_PX = 12;
const TAP_MAX_DURATION_MS = 400;

export interface MobileControlActions {
  zoomByScale(scale: number): void;
  interactAtClientPoint(clientX: number, clientY: number): void;
}

export function joystickVector(dx: number, dy: number, radius: number, deadZone = 0.1): Point {
  if (![dx, dy, radius, deadZone].every(Number.isFinite) || radius <= 0) return { x: 0, y: 0 };

  const magnitude = Math.hypot(dx, dy);
  const safeDeadZone = Math.min(0.95, Math.max(0, deadZone));
  const deadRadius = radius * safeDeadZone;
  if (magnitude <= deadRadius || magnitude === 0) return { x: 0, y: 0 };

  const clampedMagnitude = Math.min(magnitude, radius);
  const usableRadius = Math.max(0.0001, radius - deadRadius);
  const normalizedMagnitude = (clampedMagnitude - deadRadius) / usableRadius;
  return {
    x: (dx / magnitude) * normalizedMagnitude,
    y: (dy / magnitude) * normalizedMagnitude
  };
}

export function incrementalPinchScale(previousDistance: number, nextDistance: number): number {
  if (!Number.isFinite(previousDistance) || !Number.isFinite(nextDistance) || previousDistance <= 0 || nextDistance <= 0) {
    return 1;
  }
  return Math.min(1.15, Math.max(0.85, nextDistance / previousDistance));
}

export function isTapGesture(
  start: Point,
  end: Point,
  elapsedMs: number,
  maxTravelPx = TAP_MAX_TRAVEL_PX,
  maxDurationMs = TAP_MAX_DURATION_MS
): boolean {
  if (
    ![start.x, start.y, end.x, end.y, elapsedMs, maxTravelPx, maxDurationMs].every(Number.isFinite) ||
    elapsedMs < 0 ||
    maxTravelPx < 0 ||
    maxDurationMs < 0
  ) {
    return false;
  }

  return distance(start, end) <= maxTravelPx && elapsedMs <= maxDurationMs;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isTouchOwnerDevice(): boolean {
  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

function isActionControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-mobile-control="interact"], [data-mobile-control="drop"]') !== null
  );
}

export class MobileOwnerControls {
  private readonly root: HTMLElement;
  private readonly buffer: PlayerControlBuffer;
  private readonly actions: MobileControlActions;
  private readonly gesturePointers = new Map<number, Point>();
  private readonly tapCandidates = new Map<number, TapCandidate>();
  private pinchDistance: number | null = null;
  private pinchActive = false;
  private joystickPointerId: number | null = null;
  private joystickOrigin: Point | null = null;
  private joystickCapture: HTMLDivElement | null = null;
  private joystickBase: HTMLDivElement | null = null;
  private joystickKnob: HTMLDivElement | null = null;

  constructor(root: HTMLElement, buffer: PlayerControlBuffer, actions: MobileControlActions) {
    this.root = root;
    this.buffer = buffer;
    this.actions = actions;

    if (!isTouchOwnerDevice()) return;

    this.root.classList.add("touch-controls-enabled");
    this.mountControls();
    this.bindPinchGesture();
  }

  private mountControls(): void {
    const overlay = document.createElement("div");
    overlay.className = "mobile-controls";
    overlay.setAttribute("aria-label", "Mobile play controls");

    const joystickCapture = document.createElement("div");
    joystickCapture.className = "mobile-joystick-capture";
    joystickCapture.dataset.mobileControl = "joystick";
    joystickCapture.setAttribute("aria-label", "Floating movement joystick zone");

    const joystick = document.createElement("div");
    joystick.className = "mobile-joystick";
    joystick.setAttribute("aria-hidden", "true");

    const knob = document.createElement("div");
    knob.className = "mobile-joystick-knob";
    joystick.append(knob);

    const actions = document.createElement("div");
    actions.className = "mobile-actions";

    const interact = this.createActionButton("Interact", "E", () => this.buffer.queueInteract());
    const drop = this.createActionButton("Drop", "Q", () => this.buffer.queueDrop());
    actions.append(interact, drop);

    overlay.append(joystickCapture, joystick, actions);
    this.root.append(overlay);

    this.joystickCapture = joystickCapture;
    this.joystickBase = joystick;
    this.joystickKnob = knob;

    joystickCapture.addEventListener("pointerdown", (event) => this.startJoystick(event));
    joystickCapture.addEventListener("pointermove", (event) => this.moveJoystick(event));
    joystickCapture.addEventListener("pointerup", (event) => this.endJoystick(event));
    joystickCapture.addEventListener("pointercancel", (event) => this.endJoystick(event));
    joystickCapture.addEventListener("lostpointercapture", () => this.resetJoystick());
  }

  private createActionButton(label: string, shortcut: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-action";
    button.dataset.mobileControl = label.toLowerCase();
    button.innerHTML = `<strong>${label}</strong><span>${shortcut}</span>`;
    button.setAttribute("aria-label", label);

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.classList.add("is-pressed");
      action();
    });
    const release = () => button.classList.remove("is-pressed");
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);

    return button;
  }

  private startJoystick(event: PointerEvent): void {
    if (this.pinchActive || this.joystickPointerId !== null) return;
    event.preventDefault();

    this.joystickPointerId = event.pointerId;
    this.joystickOrigin = { x: event.clientX, y: event.clientY };
    this.joystickCapture?.setPointerCapture(event.pointerId);
    this.positionJoystickBase(event.clientX, event.clientY);
    this.joystickBase?.classList.add("is-active");
    this.buffer.clearMovement();
  }

  private moveJoystick(event: PointerEvent): void {
    if (this.pinchActive || event.pointerId !== this.joystickPointerId || !this.joystickOrigin) return;
    event.preventDefault();

    const base = this.joystickBase;
    const knob = this.joystickKnob;
    if (!base || !knob) return;

    const baseRect = base.getBoundingClientRect();
    const radius = Math.max(1, Math.min(baseRect.width, baseRect.height) * 0.36);
    const vector = joystickVector(event.clientX - this.joystickOrigin.x, event.clientY - this.joystickOrigin.y, radius, 0.08);

    if (vector.x !== 0 || vector.y !== 0) this.cancelTapCandidate(event.pointerId);
    this.buffer.setMovement(vector.x, vector.y);
    knob.style.transform = `translate(${(vector.x * radius).toFixed(1)}px, ${(vector.y * radius).toFixed(1)}px)`;
  }

  private endJoystick(event: PointerEvent): void {
    if (event.pointerId !== this.joystickPointerId) return;
    event.preventDefault();
    this.resetJoystick();
  }

  private positionJoystickBase(clientX: number, clientY: number): void {
    const base = this.joystickBase;
    if (!base) return;
    const rootRect = this.root.getBoundingClientRect();
    base.style.left = `${(clientX - rootRect.left).toFixed(1)}px`;
    base.style.top = `${(clientY - rootRect.top).toFixed(1)}px`;
  }

  private resetJoystick(releaseCapture = false): void {
    const pointerId = this.joystickPointerId;
    this.joystickPointerId = null;
    this.joystickOrigin = null;
    this.buffer.clearMovement();
    this.joystickBase?.classList.remove("is-active");
    if (this.joystickKnob) this.joystickKnob.style.transform = "translate(0px, 0px)";

    if (
      releaseCapture &&
      pointerId !== null &&
      this.joystickCapture?.hasPointerCapture(pointerId)
    ) {
      this.joystickCapture.releasePointerCapture(pointerId);
    }
  }

  private bindPinchGesture(): void {
    this.root.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch" || isActionControlTarget(event.target)) return;

        const point = { x: event.clientX, y: event.clientY };
        this.gesturePointers.set(event.pointerId, point);
        this.tapCandidates.set(event.pointerId, {
          start: point,
          startedAt: event.timeStamp,
          cancelled: false
        });

        if (this.gesturePointers.size >= 2) {
          this.pinchActive = true;
          for (const candidate of this.tapCandidates.values()) candidate.cancelled = true;
          this.resetJoystick(true);
        }
        this.refreshPinchBaseline();
      },
      { capture: true }
    );

    window.addEventListener(
      "pointermove",
      (event) => {
        const previous = this.gesturePointers.get(event.pointerId);
        if (!previous) return;

        const next = { x: event.clientX, y: event.clientY };
        this.gesturePointers.set(event.pointerId, next);
        const candidate = this.tapCandidates.get(event.pointerId);
        if (candidate && distance(candidate.start, next) > TAP_MAX_TRAVEL_PX) candidate.cancelled = true;

        if (this.gesturePointers.size < 2) return;

        event.preventDefault();
        const points = [...this.gesturePointers.values()].slice(0, 2);
        const nextDistance = distance(points[0], points[1]);
        if (this.pinchDistance !== null) this.actions.zoomByScale(incrementalPinchScale(this.pinchDistance, nextDistance));
        this.pinchDistance = nextDistance;
      },
      { capture: true, passive: false }
    );

    const endPointer = (event: PointerEvent, allowTap: boolean) => {
      const candidate = this.tapCandidates.get(event.pointerId);
      if (
        allowTap &&
        candidate &&
        !candidate.cancelled &&
        isTapGesture(
          candidate.start,
          { x: event.clientX, y: event.clientY },
          event.timeStamp - candidate.startedAt
        )
      ) {
        this.actions.interactAtClientPoint(event.clientX, event.clientY);
      }
      this.tapCandidates.delete(event.pointerId);

      if (!this.gesturePointers.delete(event.pointerId)) return;
      if (this.gesturePointers.size < 2) this.pinchActive = false;
      this.refreshPinchBaseline();
    };
    window.addEventListener("pointerup", (event) => endPointer(event, true), { capture: true });
    window.addEventListener("pointercancel", (event) => endPointer(event, false), { capture: true });
  }

  private cancelTapCandidate(pointerId: number): void {
    const candidate = this.tapCandidates.get(pointerId);
    if (candidate) candidate.cancelled = true;
  }

  private refreshPinchBaseline(): void {
    if (this.gesturePointers.size < 2) {
      this.pinchDistance = null;
      return;
    }
    const points = [...this.gesturePointers.values()].slice(0, 2);
    this.pinchDistance = distance(points[0], points[1]);
  }
}
