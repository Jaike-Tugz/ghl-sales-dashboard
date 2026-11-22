import { requireViewer } from "@/lib/auth/viewer";
import { getDataset, getSettings, isDemoMode } from "@/lib/data";
import { createUserClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm, UserRow } from "@/components/dashboard/settings-forms";

export const metadata = { title: "Settings" };

async function loadUsers() {
  const db = await createUserClient();
  const [{ data: users }, { data: access }, { data: reps }] = await Promise.all([
    db.from("user_profiles").select("id, email, full_name, role, active").order("created_at"),
    db.from("user_account_access").select("user_id, account_id"),
    db.from("sales_reps").select("id, user_id"),
  ]);
  return (users ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    name: u.full_name ?? u.email,
    role: u.role,
    active: u.active,
    accountIds: (access ?? []).filter((a) => a.user_id === u.id).map((a) => a.account_id),
    repIds: (reps ?? []).filter((r) => r.user_id === u.id).map((r) => r.id),
  }));
}

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const [settings, ds] = await Promise.all([getSettings(), getDataset(viewer)]);
  const isAdmin = viewer.role === "admin";
  const demo = isDemoMode();
  const users = isAdmin && !demo ? await loadUsers() : [];
  const accountName = new Map(ds.accounts.map((a) => [a.id, a.name]));
  return (
    <>
      <PageHeader title="Settings" description={isAdmin ? "Metric definitions and thresholds apply to every account and user." : "Read-only — only admins can change settings."} />
      <Card>
        <CardHeader>
          <CardTitle>Reporting & metric configuration</CardTitle>
          <CardDescription>Changes re-calculate every page immediately; nothing is written to GHL.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm settings={settings} readOnly={!isAdmin} />
        </CardContent>
      </Card>
      {isAdmin && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Users & roles</CardTitle>
            <CardDescription>
              New sign-ups land inactive with no access. Admin: everything. Manager: the accounts ticked. Rep: only leads assigned to the GHL identities linked here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {demo && <p className="text-xs text-muted-foreground">Demo mode: use the user menu (top right) to view the dashboard as an admin, manager or rep.</p>}
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                accounts={ds.accounts.map((a) => ({ id: a.id, name: a.name }))}
                reps={ds.reps.map((r) => ({ id: r.id, name: r.name, accountName: accountName.get(r.accountId) ?? "" }))}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
