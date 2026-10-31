// One foreground state for both browser visibility and Capacitor's native lifecycle.
let active = true;
export function isAppActive(): boolean { return active; }
export function setAppActive(value: boolean): void { active = value; }
