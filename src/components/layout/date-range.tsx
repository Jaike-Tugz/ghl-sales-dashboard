"use client";
import { CalendarRange } from "lucide-react";
import { useEffect, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { presetRange, type RangePreset } from "@/lib/time";
import { useQueryNav } from "./use-query-nav";

const PRESETS = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
  ["mtd", "Month to date"],
  ["qtd", "Quarter to date"],
  ["ytd", "Year to date"],
  ["12m", "Last 12 months"],
  ["custom", "Custom range…"],
] as const;

const VALID = PRESETS.map(([v]) => v as string);

export function DateRangeControl({ timeZone }: { timeZone: string }) {
  const { set, sp } = useQueryNav();
  const raw = sp.get("range") ?? "30d";
  const preset = VALID.includes(raw) && (raw !== "custom" || (sp.get("from") && sp.get("to"))) ? raw : "30d";
  const { from, to } = preset === "custom" ? { from: sp.get("from")!, to: sp.get("to")! } : presetRange(preset as RangePreset, timeZone);
  const [custom, setCustom] = useState(preset === "custom");
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  useEffect(() => {
    setF(from);
    setT(to);
  }, [from, to]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <CalendarRange className="size-4 text-muted-foreground" />
        <NativeSelect
          aria-label="Date range"
          value={custom ? "custom" : preset}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "custom") setCustom(true);
            else {
              setCustom(false);
              set({ range: v, from: null, to: null });
            }
          }}
          className="w-40"
        >
          {PRESETS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </div>
      {custom && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            set({ range: "custom", from: f, to: t });
          }}
        >
          <Input type="date" value={f} max={t} onChange={(e) => setF(e.target.value)} className="w-36" aria-label="From" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={t} min={f} onChange={(e) => setT(e.target.value)} className="w-36" aria-label="To" />
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
      )}
      <span className="hidden text-[11px] text-muted-foreground xl:inline" title="All date boundaries are midnight-to-midnight in the reporting timezone">
        {timeZone}
      </span>
    </div>
  );
}
