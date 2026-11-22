"use client";
import { useActionState } from "react";
import { Save } from "lucide-react";
import { saveSettings, updateUser } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { OUTCOME_LABELS } from "@/lib/settings-defaults";
import type { AppSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

function Msg({ s }: { s: { error?: string; message?: string } }) {
  if (!s.error && !s.message) return null;
  return <p className={cn("text-xs", s.error ? "text-destructive" : "text-success")}>{s.error ?? s.message}</p>;
}

const OUTCOMES = Object.entries(OUTCOME_LABELS);

export function SettingsForm({ settings, readOnly }: { settings: AppSettings; readOnly: boolean }) {
  const [state, action, pending] = useActionState(saveSettings, {});
  const om = settings.outcomeMapping;
  return (
    <form action={action} className="grid gap-6">
      <fieldset disabled={readOnly} className="grid gap-6">
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">Reporting</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tz">Reporting timezone (IANA)</Label>
              <Input id="tz" name="reportingTimezone" defaultValue={settings.reportingTimezone} placeholder="Australia/Sydney" />
              <p className="text-[11px] text-muted-foreground">A day runs 00:00–24:00 in this zone; ranges are inclusive of both end dates.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="grace">Pending-outcome grace (minutes)</Label>
              <Input id="grace" name="grace" type="number" min={0} max={1440} defaultValue={settings.pendingOutcomeGraceMinutes} />
              <p className="text-[11px] text-muted-foreground">After an appointment ends + this long without a GHL status, it shows as “Pending outcome”.</p>
            </div>
            <label className="flex items-center gap-2 self-center text-sm">
              <input type="checkbox" name="abandonedCountsAsLost" defaultChecked={settings.abandonedCountsAsLost} className="size-4 accent-[var(--primary)]" />
              Count “abandoned” opportunities as lost
            </label>
          </div>
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">Funnel stages</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {settings.funnelStages.map((s) => (
              <div key={s.key} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <input
                  type="checkbox"
                  name={`enabled_${s.key}`}
                  defaultChecked={s.enabled}
                  disabled={s.key === "new_lead" || s.key === "closing"}
                  className="size-4 accent-[var(--primary)]"
                  aria-label={`Show ${s.label}`}
                />
                <Input name={`label_${s.key}`} defaultValue={s.label} className="h-8" aria-label={`${s.key} label`} />
                <span className="w-24 shrink-0 font-mono text-[10px] text-muted-foreground">{s.key}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Enable “fourth_stage” to add a fourth business stage (e.g. a fourth call or contract review). Map GHL stages to it in Integrations.</p>
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">Appointment outcome mapping</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["om_showed", "GHL “showed”", om.showed],
                ["om_noshow", "GHL “noshow”", om.noshow],
                ["om_cancelled", "GHL “cancelled”", om.cancelled],
                ["om_pastUnconfirmed", "Past “new/confirmed”", om.pastUnconfirmed],
              ] as const
            ).map(([name, label, val]) => (
              <div key={name} className="grid gap-1.5">
                <Label>{label}</Label>
                <NativeSelect name={name} defaultValue={val}>
                  {OUTCOMES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="excludeInvalid" defaultChecked={om.excludeInvalid} className="size-4 accent-[var(--primary)]" />
            Exclude GHL “invalid” appointments from all counts
          </label>
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">Follow-up thresholds</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {settings.followUpRules.map((r) => (
              <div key={r.key} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <input type="checkbox" name={`rule_enabled_${r.key}`} defaultChecked={r.enabled} className="size-4 accent-[var(--primary)]" aria-label={`Enable ${r.label}`} />
                <span className="flex-1 text-sm">{r.label}</span>
                <Input name={`rule_days_${r.key}`} type="number" min={0} max={365} defaultValue={r.thresholdDays} className="h-8 w-20" aria-label="Days" />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            ))}
          </div>
        </section>
      </fieldset>
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            <Save /> Save settings
          </Button>
          <Msg s={state} />
        </div>
      )}
    </form>
  );
}

export function UserRow({
  user,
  accounts,
  reps,
}: {
  user: { id: string; email: string; name: string; role: string; active: boolean; accountIds: string[]; repIds: string[] };
  accounts: Array<{ id: string; name: string }>;
  reps: Array<{ id: string; name: string; accountName: string }>;
}) {
  const [state, action, pending] = useActionState(updateUser, {});
  return (
    <form action={action} className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1.2fr_0.7fr_0.5fr_1.5fr_1.5fr_auto] lg:items-start">
      <input type="hidden" name="user_id" value={user.id} />
      <div>
        <div className="text-sm font-medium">{user.name}</div>
        <div className="text-[11px] text-muted-foreground">{user.email}</div>
      </div>
      <NativeSelect name="role" defaultValue={user.role} aria-label="Role">
        <option value="admin">Admin</option>
        <option value="manager">Manager</option>
        <option value="rep">Sales rep</option>
      </NativeSelect>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" name="active" defaultChecked={user.active} className="size-4 accent-[var(--primary)]" /> Active
      </label>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" title="Manager account access">
        <span className="w-full text-[10px] uppercase text-muted-foreground">Manager accounts</span>
        {accounts.map((a) => (
          <label key={a.id} className="flex items-center gap-1">
            <input type="checkbox" name="account" value={a.id} defaultChecked={user.accountIds.includes(a.id)} className="accent-[var(--primary)]" />
            {a.name}
          </label>
        ))}
      </div>
      <div className="flex max-h-24 flex-wrap gap-x-3 gap-y-1 overflow-y-auto text-xs" title="GHL users this login is">
        <span className="w-full text-[10px] uppercase text-muted-foreground">Linked GHL rep identities</span>
        {reps.map((r) => (
          <label key={r.id} className="flex items-center gap-1">
            <input type="checkbox" name="rep" value={r.id} defaultChecked={user.repIds.includes(r.id)} className="accent-[var(--primary)]" />
            {r.name} <span className="text-muted-foreground">({r.accountName})</span>
          </label>
        ))}
      </div>
      <div className="flex flex-col items-end gap-1">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Save
        </Button>
        <Msg s={state} />
      </div>
    </form>
  );
}
