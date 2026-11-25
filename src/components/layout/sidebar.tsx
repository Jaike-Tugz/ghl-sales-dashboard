"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { GLOBAL_KEYS, NAV } from "./nav";

function useCarriedQuery() {
  const sp = useSearchParams();
  const q = new URLSearchParams();
  for (const k of GLOBAL_KEYS) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const query = useCarriedQuery();
  return (
    <nav className="flex flex-col gap-px px-3">
      {NAV.filter((n) => (n.roles as readonly Role[]).includes(role)).map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={`${n.href}${query}`}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-[7px] text-[13px] text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-card text-foreground shadow-[0_0_0_1px_var(--border)]",
            )}
          >
            <Icon strokeWidth={1.75} className={cn("size-4 transition-colors", active ? "text-foreground" : "text-muted-foreground/80 group-hover:text-foreground")} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-16 items-center gap-3 px-6">
      <div className="flex size-7 items-center justify-center rounded-md bg-primary text-[11px] font-semibold tracking-tight text-primary-foreground">SC</div>
      <div className="leading-tight">
        <div className="text-[13px] font-medium tracking-tight">Sales Calls</div>
        <div className="text-[11px] text-muted-foreground">Pipeline intelligence</div>
      </div>
    </div>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <Brand />
      <NavLinks role={role} />
      <div className="mt-auto flex items-center gap-2 px-6 py-5 text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-success" />
        Read-only sync with GHL
      </div>
    </aside>
  );
}

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Brand />
        <NavLinks role={role} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
