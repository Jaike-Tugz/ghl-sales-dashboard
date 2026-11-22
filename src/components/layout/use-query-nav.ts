"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

/** Update URL query params (the source of truth for filters) without losing the others. */
export function useQueryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const q = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") q.delete(k);
        else q.set(k, v);
      }
      q.delete("page");
      startTransition(() => router.push(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false }));
    },
    [router, pathname, sp],
  );
  return { set, sp, pending };
}
