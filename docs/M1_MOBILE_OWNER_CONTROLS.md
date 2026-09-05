# M1 — Mobile Owner-test controls v0

Purpose: let the Owner perform frequent hands-on P1 tests from a phone without creating a separate mobile game or bypassing world rules.

Scope:

- client-side analog touch joystick;
- Interact and Drop touch buttons;
- two-finger pinch camera zoom;
- shared buffered player-control seam feeding the existing `WorldInput`;
- keyboard remains supported in parallel;
- touch controls mount only on touch/coarse-pointer devices.

Explicit non-goals:

- no mobile-specific world logic;
- no placement UI;
- no touch targeting/action selection;
- no fullscreen/PWA/app-shell work;
- no mobile debug redesign;
- no changes to `src/world`;
- no changes to PR #13 motion interpolation.

Owner gate: on a real phone, verify that joystick movement, Interact, Drop and pinch zoom are usable; that controls do not accidentally trigger each other; and that the page remains scrollable outside the game area.
