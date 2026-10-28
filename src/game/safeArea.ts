/** Space taken by notches, rounded corners and system bars, in CSS pixels (the same units as `app.screen`). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Screens sit inside the safe area. Full-screen layers they draw (dimming, flashes) reach this far past
 * the screen's box, so they also cover the margins around it.
 */
export const OVERSCAN = 200;

let probe: HTMLDivElement | null = null;

/**
 * Reads the CSS env(safe-area-inset-*) values through an invisible element. They are non-zero
 * only with `viewport-fit=cover` (index.html) on devices that draw under notches or system bars.
 */
export function readSafeArea(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
}
