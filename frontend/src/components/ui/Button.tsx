// components/ui/Button.tsx
import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/core";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl2 px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  // 現在の primary を既定にしています（bg-brand-blue / text-black）
  const variantClass =
    variant === "primary"
      ? "bg-brand-blue text-black hover:bg-brand-blueLight"
      : variant === "secondary"
      ? "bg-white/10 text-white hover:bg-white/15"
      : "bg-transparent text-white hover:bg-white/10"; // ghost

  return (
    <button className={cn(base, variantClass, className)} {...props} />
  );
}
