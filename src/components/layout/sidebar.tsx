"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, PhoneCall } from "lucide-react";
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
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV.filter((n) => (n.roles as readonly Role[]).includes(role)).map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={`${n.href}${query}`}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              active && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className={cn("size-4 transition-colors", active ? "text-primary" : "group-hover:text-primary")} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-16 items-center gap-2.5 px-6">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <PhoneCall className="size-4" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">Sales Call Tracker</div>
        <div className="text-[11px] text-muted-foreground">GHL multi-account</div>
      </div>
    </div>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <Brand />
      <NavLinks role={role} />
      <div className="mt-auto px-6 py-4 text-[11px] text-muted-foreground">Read-only against GHL</div>
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
