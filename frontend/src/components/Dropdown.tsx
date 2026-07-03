import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/** Small themed dropdown (button + click-outside popover). */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = options.find((o) => o.key === value);
  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-full items-center justify-between gap-1.5 rounded-full bg-elevated px-3 py-1.5 text-xs font-medium text-offwhite ring-1 ring-white/10 transition-colors hover:ring-white/20"
      >
        {current?.label}
        <ChevronDown
          className={clsx(
            "h-3.5 w-3.5 text-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 min-w-[168px] overflow-hidden rounded-xl bg-elevated p-1 shadow-lg ring-1 ring-white/10">
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              className={clsx(
                "block w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors",
                o.key === value
                  ? "bg-neon-emerald/15 text-neon-emerald"
                  : "text-offwhite/80 hover:bg-white/5"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
