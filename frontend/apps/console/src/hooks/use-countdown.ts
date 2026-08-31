import { useEffect, useState } from "react";

export function useCountdown() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const timeout = window.setTimeout(
      () => setSeconds((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timeout);
  }, [seconds]);

  return {
    seconds,
    start(duration = 60) {
      setSeconds(duration);
    },
  };
}
