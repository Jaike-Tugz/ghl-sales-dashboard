"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 size-8 text-destructive" />
      <h2 className="font-semibold">Something went wrong loading this page</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.digest ? `Reference: ${error.digest}` : error.message}</p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
