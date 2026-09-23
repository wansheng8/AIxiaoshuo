import { useEffect, useState } from "react";

export function useMinWidth(px: number) {
  const query = `(min-width: ${px}px)`;
  const [match, setMatch] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(query).matches));

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return match;
}
