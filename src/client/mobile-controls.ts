import { PlayerControlBuffer } from "./player-control-buffer";

interface Point {
  x: number;
  y: number;
}

export interface MobileControlActions {
  zoomByScale(scale: number): void;
}

export function joystickVector(dx: number, dy: number, radius: number, deadZone = 0.1): Point {
  if (![dx, dy, radius, deadZone].every(Number.isFinite) || radius <= 0) return { x: 0, y: 0 };
  const magnitude = Math.hypot(dx, dy);
  if (magnitude <= radius * Math.max(0, deadZone)) return { x: 0, y: 0 };

  const clampedMagnitude = Math.min(magnitude, radius);
  const scale = clampedMagnitude / magnitude / radius;
  return { x: dx * scale, y: dy * scale };
}

export function incrementalPinchScale(previousDistance: number, nextDistance: number): number {
  if (!Number.isFinite(previousDistance) || !Number.isFinite(nextDistance) || previousDistance <= 0 || nextDistance <= 0) {
    return 1;
  }
  return Math.min(1.15, Math.max(0.85, nextDistance / previousDistance));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isTouchCapable(): boolean {
  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

function isControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-mobile-control]") !== null;
}

export class MobileOwnerControls {
  private readonly root: HTMLElement;
  private readonly buffer: PlayerControlBuffer;
  private readonly actions: MobileControlActions;
  private readonly gesturePointers = new Map<number, Point>();
  private pinchDistance: number | null = null;
  private joystickPointerId: number | null = null;
  private joystickZone: HTMLDivElement | null = null;
  private joystickKnob: HTMLDivElement | null = null;

  constructor(root: HTMLElement, buffer: PlayerControlBuffer, actions: MobileControlActions) {
    this.root = root;
    this.buffer = buffer;
    this.actions = actions;

    if (!isTouchCapable()) return;

    this.root.classList.add("touch-controls-enabled");
    this.mountControls();
    this.bindPinchGesture();
  }

  private mountControls(): void {
    const overlay = document.createElement("div");
    overlay.className = "mobile-controls";
    overlay.setAttribute("aria-label", "Mobile play controls");

    const joystick = document.createElement("div");
    joystick.className = "mobile-joystick";
    joystick.dataset.mobileControl = "joystick";
    joystick.setAttribute("aria-label", "Movement joystick");

    const knob = document.createElement("div");
    knob.className = "mobile-joystick-knob";
    joystick.append(knob);

    const actions = document.createElement("div");
    actions.className = "mobile-actions";

    const interact = this.createActionButton("Interact", "E", () => this.buffer.queueInteract());
    const drop = this.createActionButton("Drop", "Q", () => this.buffer.queueDrop());
    actions.append(interact, drop);

    overlay.append(joystick, actions);
    this.root.append(overlay);

    this.joystickZone = joystick;
    this.joystickKnob = knob;

    joystick.addEventListener("pointerdown", (event) => this.startJoystick(event));
    joystick.addEventListener("pointermove", (event) => this.moveJoystick(event));
    joystick.addEventListener("pointerup", (event) => this.endJoystick(event));
    joystick.addEventListener("pointercancel", (event) => this.endJoystick(event));
    joystick.addEventListener("lostpointercapture", () => this.resetJoystick());
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
    if (this.joystickPointerId !== null) return;
    event.preventDefault();
    this.joystickPointerId = event.pointerId;
    this.joystickZone?.setPointerCapture(event.pointerId);
    this.updateJoystick(event);
  }

  private moveJoystick(event: PointerEvent): void {
    if (event.pointerId !== this.joystickPointerId) return;
    event.preventDefault();
    this.updateJoystick(event);
  }

  private endJoystick(event: PointerEvent): void {
    if (event.pointerId !== this.joystickPointerId) return;
    event.preventDefault();
    this.resetJoystick();
  }

  private updateJoystick(event: PointerEvent): void {
    const zone = this.joystickZone;
    const knob = this.joystickKnob;
    if (!zone || !knob) return;

    const rect = zone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
    const vector = joystickVector(event.clientX - centerX, event.clientY - centerY, radius);

    this.buffer.setMovement(vector.x, vector.y);
    knob.style.transform = `translate(${(vector.x * radius).toFixed(1)}px, ${(vector.y * radius).toFixed(1)}px)`;
  }

  private resetJoystick(): void {
    this.joystickPointerId = null;
    this.buffer.clearMovement();
    if (this.joystickKnob) this.joystickKnob.style.transform = "translate(0px, 0px)";
  }

  private bindPinchGesture(): void {
    this.root.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch" || isControlTarget(event.target)) return;
        this.gesturePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.refreshPinchBaseline();
      },
      { capture: true }
    );

    window.addEventListener(
      "pointermove",
      (event) => {
        if (!this.gesturePointers.has(event.pointerId)) return;
        this.gesturePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.gesturePointers.size < 2) return;

        event.preventDefault();
        const points = [...this.gesturePointers.values()].slice(0, 2);
        const nextDistance = distance(points[0], points[1]);
        if (this.pinchDistance !== null) this.actions.zoomByScale(incrementalPinchScale(this.pinchDistance, nextDistance));
        this.pinchDistance = nextDistance;
      },
      { capture: true, passive: false }
    );

    const endPointer = (event: PointerEvent) => {
      if (!this.gesturePointers.delete(event.pointerId)) return;
      this.refreshPinchBaseline();
    };
    window.addEventListener("pointerup", endPointer, { capture: true });
    window.addEventListener("pointercancel", endPointer, { capture: true });
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
