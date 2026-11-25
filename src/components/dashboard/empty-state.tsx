import { Inbox, type LucideIcon } from "lucide-react";

export function EmptyState({ title, description, icon: Icon = Inbox, children }: { title: string; description?: string; icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
