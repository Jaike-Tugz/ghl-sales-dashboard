"use client";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { useQueryNav } from "@/components/layout/use-query-nav";

interface Option {
  value: string;
  label: string;
}

export function FilterBar({ reps, stages, outcomes, search = true }: { reps?: Option[]; stages?: Option[]; outcomes?: Option[]; search?: boolean }) {
  const { set, sp } = useQueryNav();
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q });
    }, 350);
    return () => clearTimeout(t);
  }, [q, sp, set]);
  const any = ["rep", "stage", "outcome", "q"].some((k) => sp.get(k));
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {search && (
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, email" className="pl-8" aria-label="Search" />
        </div>
      )}
      {reps && (
        <NativeSelect aria-label="Sales representative" value={sp.get("rep") ?? ""} onChange={(e) => set({ rep: e.target.value })} className="w-48">
          <option value="">All representatives</option>
          {reps.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      )}
      {stages && (
        <NativeSelect aria-label="Stage" value={sp.get("stage") ?? ""} onChange={(e) => set({ stage: e.target.value })} className="w-44">
          <option value="">All stages</option>
          {stages.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      )}
      {outcomes && (
        <NativeSelect aria-label="Outcome" value={sp.get("outcome") ?? ""} onChange={(e) => set({ outcome: e.target.value })} className="w-44">
          <option value="">Any outcome</option>
          {outcomes.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      )}
      {any && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            set({ rep: null, stage: null, outcome: null, q: null });
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
