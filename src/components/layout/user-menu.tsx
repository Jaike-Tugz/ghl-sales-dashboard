"use client";
import { LogOut, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { switchDemoPersona } from "@/app/actions/demo";

export function UserMenu({ name, email, role, demo }: { name: string; email: string; role: string; demo: boolean }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initials}</span>
          <span className="hidden max-w-36 truncate text-sm md:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="truncate text-sm text-foreground">{name}</span>
          <span className="truncate font-normal">{email}</span>
          <Badge variant="secondary" className="w-fit capitalize">{role}</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {demo ? (
          <>
            <DropdownMenuLabel>Demo: view as</DropdownMenuLabel>
            {(["admin", "manager", "rep"] as const).map((p) => (
              <DropdownMenuItem key={p} onSelect={() => switchDemoPersona(p)}>
                <UserCog /> <span className="capitalize">{p}</span>
              </DropdownMenuItem>
            ))}
          </>
        ) : (
          <form action="/auth/signout" method="post">
            <button type="submit" className="w-full">
              <DropdownMenuItem>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </button>
          </form>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
