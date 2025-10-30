// components/ui/Card.tsx
import { cn } from "@/lib/core";
import { ReactNode } from "react";

export function Card({
  className,
  children
}: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-[rgb(8,10,15)]/80 p-5 backdrop-blur",
        "hover:shadow-glow transition-shadow",
        className
      )}
    >
      {children}
    </div>
  );
}
