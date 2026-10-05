'use client';
import { useEffect } from 'react';
import { useMediaQuery } from '../lib/use-media-query';
export function CombatTransitionWipe({
  direction,
  onFinish,
}: {
  direction: 'enter' | 'exit';
  onFinish: () => void;
}) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const timer = setTimeout(onFinish, reduced ? 200 : 1200);
    return () => clearTimeout(timer);
  }, [onFinish, reduced]);
  return (
    <div
      className={`combat-wipe combat-wipe-${direction}${reduced ? ' reduced' : ''}`}
      aria-hidden="true"
    >
      <span />
      <span />
    </div>
  );
}
export function playBattleCue(victory = false) {
  try {
    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.value = 0.035;
    gain.connect(context.destination);
    (victory ? [261.63, 329.63, 392, 523.25] : [164.81, 220, 329.63]).forEach(
      (frequency, index) => {
        const note = context.createOscillator();
        note.type = 'triangle';
        note.frequency.value = frequency;
        note.connect(gain);
        note.start(context.currentTime + index * 0.06);
        note.stop(context.currentTime + 0.24 + index * 0.06);
      },
    );
    setTimeout(() => void context.close(), 600);
  } catch {}
}
