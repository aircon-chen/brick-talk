export function stepTiming(speed: number, reducedMotion = false) {
  return { fall: reducedMotion ? 0 : 600 / speed, total: 900 / speed };
}

export function easeOut(t: number) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

export function stepProgress(elapsed: number, speed: number, reducedMotion = false) {
  const { fall, total } = stepTiming(speed, reducedMotion);
  return { progress: fall === 0 ? 1 : easeOut(elapsed / fall), done: elapsed >= total };
}
