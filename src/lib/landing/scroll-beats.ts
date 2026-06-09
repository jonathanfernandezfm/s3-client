export interface BeatState {
  /** Which beat is active (0-based). */
  index: number;
  /** Progress within the active beat, 0..1. */
  local: number;
}

/**
 * Maps overall scroll progress (0..1) onto N sequential "beats".
 * Used by the sticky metaphor-reveal section to decide which scene
 * is on stage and how far through it we are.
 */
export function getBeat(progress: number, beatCount: number): BeatState {
  if (beatCount <= 0) {
    throw new Error("beatCount must be positive");
  }
  const clamped = Math.min(Math.max(progress, 0), 1);
  const scaled = clamped * beatCount;
  const index = Math.min(Math.floor(scaled), beatCount - 1);
  return { index, local: scaled - index };
}
