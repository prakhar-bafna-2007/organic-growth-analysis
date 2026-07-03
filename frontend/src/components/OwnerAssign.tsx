import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Plus, X } from "lucide-react";
import clsx from "clsx";

/** Compact control to assign/reassign/unassign an account's owner. Existing
 *  owners are listed; typing a new name creates that owner. */
export function OwnerAssign({
  current,
  owners,
  onAssign,
}: {
  current: string | null;
  owners: string[];
  onAssign: (owner: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function choose(o: string) {
    onAssign(o);
    setOpen(false);
    setName("");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full bg-surface/70 px-2.5 py-1 text-[11px] font-medium ring-1 ring-white/10 transition-colors hover:ring-white/25"
      >
        <span className={clsx(current ? "text-offwhite" : "text-neon-amber")}>
          {current ?? "Assign owner"}
        </span>
        <ChevronDown
          className={clsx("h-3 w-3 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 min-w-[190px] rounded-xl bg-elevated p-1 shadow-lg ring-1 ring-white/10">
          {owners.map((o) => (
            <button
              key={o}
              onClick={() => choose(o)}
              className={clsx(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                o === current
                  ? "bg-neon-emerald/15 text-neon-emerald"
                  : "text-offwhite/80 hover:bg-white/5"
              )}
            >
              {o}
              {o === current && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
          {current && (
            <button
              onClick={() => choose("")}
              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-neon-red/80 transition-colors hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" />
              Unassign
            </button>
          )}
          <div className="mt-1 flex items-center gap-1 border-t border-white/5 p-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) choose(name.trim());
              }}
              placeholder="New owner…"
              className="w-full bg-transparent px-1.5 py-1 text-xs text-offwhite placeholder:text-muted outline-none"
            />
            <button
              onClick={() => name.trim() && choose(name.trim())}
              className="rounded-md p-1 text-neon-emerald transition-colors hover:bg-white/5"
              title="Add owner"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
