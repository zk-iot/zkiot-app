// ---------- classNames helper ----------
import { clsx, type ClassValue } from "clsx";

/** Lightweight Tailwind class merger */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// ---------- useInterval Hook ----------
import { useEffect, useRef } from "react";

/** setInterval as a React hook (pass null to stop) */
export function useInterval(callback: () => void, delay: number | null) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ---------- Demo mode helper ----------
/**
 * Always returns true (demo mode always ON)
 */
export function isDemoMode(): boolean {
  return true;
}

