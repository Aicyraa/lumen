import { useEffect, useState } from "react";

// Seconds left until a deadline measured on the monotonic clock (performance.now), so a changed
// system clock cannot stretch or cut the wait. Counts down once per second and stops at 0.
export function useCountdown(seconds: number): number {
  const [deadline] = useState(() => performance.now() + seconds * 1000);
  const left = () => Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
  const [remaining, setRemaining] = useState(left);
  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => {
      const n = left();
      setRemaining(n);
      if (n <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return remaining;
}

const two = (n: number) => String(n).padStart(2, "0");
// 702 -> "11:42"; an hour or more -> "1:05:09".
export function fmtCountdown(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`;
}
