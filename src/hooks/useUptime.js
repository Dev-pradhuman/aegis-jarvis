import { useEffect, useRef, useState } from 'react';

function formatUptime(totalSeconds) {
  let s = totalSeconds;
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return [d, h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Ticks a seconds counter once per second, starting from initialSeconds,
 * and returns it pre-formatted as DD:HH:MM:SS.
 */
export default function useUptime(initialSeconds) {
  const secondsRef = useRef(initialSeconds);
  const [formatted, setFormatted] = useState(() => formatUptime(initialSeconds));

  useEffect(() => {
    const id = setInterval(() => {
      secondsRef.current += 1;
      setFormatted(formatUptime(secondsRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return formatted;
}
