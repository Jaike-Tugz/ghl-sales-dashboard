"use client";
import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ExportButton({ kind, label = "Export CSV" }: { kind: string; label?: string }) {
  const sp = useSearchParams();
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={`/api/export/${kind}?${sp.toString()}`} download>
        <Download /> {label}
      </a>
    </Button>
  );
}
