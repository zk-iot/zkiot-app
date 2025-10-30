// components/ui/Toggle.tsx
import { cn } from "@/lib/core";

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <span className="text-sm text-white/70">{label}</span>
      <span
        className={cn(
          "h-6 w-11 rounded-full p-1 transition-colors",
          checked ? "bg-brand-blue" : "bg-white/10"
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </span>
    </label>
  );
}
