import { Suspense } from "react";
import { FlaskConical } from "lucide-react";
import { requireViewer } from "@/lib/auth/viewer";
import { getDataset, getSettings, isDemoMode } from "@/lib/data";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { AccountSelector } from "@/components/layout/account-selector";
import { DateRangeControl } from "@/components/layout/date-range";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const [settings, ds] = await Promise.all([getSettings(), getDataset(viewer)]);
  const demo = isDemoMode();
  return (
    <div className="flex min-h-dvh">
      <Suspense>
        <Sidebar role={viewer.role} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        {demo && (
          <div className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-center text-xs font-medium">
            <FlaskConical className="size-3.5" />
            Demo data — generated sample records, not real metrics. Connect Supabase and your GHL accounts to see live data.
          </div>
        )}
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b bg-background/80 px-4 py-3 backdrop-blur lg:px-8">
          <Suspense>
            <MobileNav role={viewer.role} />
            <AccountSelector accounts={ds.accounts.map((a) => ({ id: a.id, name: a.name, color: a.color }))} />
            <DateRangeControl timeZone={settings.reportingTimezone} />
          </Suspense>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={viewer.name} email={viewer.email} role={viewer.role} demo={demo} />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
