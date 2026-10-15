/**
 * Play a figure once, when the reader can see it.
 *
 * Two ways of deciding that, because the figures sit in two places.
 *
 * A figure in the middle of a page waits until the whole of it is on screen,
 * in the upper two thirds, so it is not over by the time the eye gets there.
 * A figure taller than that band can never be wholly inside it, so for one of
 * those it is enough that it fills the band; without that, a tall figure on a
 * short screen never played and stayed empty.
 *
 * A figure in the first screen, the home page's rebuild and the /agents race,
 * passes `threshold` instead and plays as soon as that share of it shows,
 * which on load is at once.
 *
 * The caller owns the Replay control and calls `play` itself.
 */
export function playWhenSeen(element: Element, play: () => void, options: { threshold?: number } = {}): void {
  const { threshold } = options;
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        let ready: boolean;
        if (threshold !== undefined) {
          ready = entry.intersectionRatio >= threshold;
        } else {
          const band = entry.rootBounds?.height ?? innerHeight;
          const whole = entry.intersectionRatio >= 0.999;
          const fills = entry.boundingClientRect.height >= band && entry.intersectionRect.height >= band * 0.9;
          ready = whole || fills;
        }
        if (ready) {
          seen.disconnect();
          play();
          return;
        }
      }
    },
    threshold !== undefined
      ? { threshold }
      : { threshold: [0, 0.25, 0.5, 0.75, 0.9, 1], rootMargin: "0px 0px -33% 0px" },
  );
  seen.observe(element);
}

/** Whether the reader asked for less motion. */
export const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
