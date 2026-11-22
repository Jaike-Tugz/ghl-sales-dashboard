"use client";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQueryNav } from "./use-query-nav";

export function AccountSelector({ accounts }: { accounts: Array<{ id: string; name: string; color: string }> }) {
  const { set, sp, pending } = useQueryNav();
  const current = sp.get("account") ?? "all";
  const label = current === "all" ? "All Accounts" : accounts.find((a) => a.id === current)?.name ?? "All Accounts";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-w-44 justify-between" data-pending={pending || undefined}>
          <span className="flex items-center gap-2 truncate">
            <Building2 className="text-muted-foreground" />
            {label}
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>GHL sub-account</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => set({ account: null, rep: null })}>
          <span className="size-2 rounded-full bg-foreground/40" />
          All Accounts
          {current === "all" && <Check className="ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {accounts.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => set({ account: a.id, rep: null })}>
            <span className="size-2 rounded-full" style={{ background: a.color }} />
            <span className="truncate">{a.name}</span>
            {current === a.id && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        {!accounts.length && <div className="px-2 py-1.5 text-xs text-muted-foreground">No accounts you can access</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
