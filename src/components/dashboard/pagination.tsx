import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({ page, pages, total, params, basePath }: { page: number; pages: number; total: number; params: Record<string, string | string[] | undefined>; basePath: string }) {
  if (pages <= 1) return <p className="mt-3 text-xs text-muted-foreground">{total} rows</p>;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && k !== "page") q.set(k, v);
    q.set("page", String(p));
    return `${basePath}?${q}`;
  };
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {total} rows · page {page} of {pages}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" asChild disabled={page <= 1}>
          <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1}>
            <ChevronLeft /> Prev
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild disabled={page >= pages}>
          <Link href={href(Math.min(pages, page + 1))} aria-disabled={page >= pages}>
            Next <ChevronRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function paginate<T>(rows: T[], pageParam: string | string[] | undefined, size = 50) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Number(Array.isArray(pageParam) ? pageParam[0] : pageParam) || 1));
  return { page, pages, slice: rows.slice((page - 1) * size, page * size), total: rows.length };
}
