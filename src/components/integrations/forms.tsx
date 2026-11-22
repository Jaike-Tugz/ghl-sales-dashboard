"use client";
import { useActionState, useState, useTransition } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { addAccount, saveMappings, syncNow, type ActionState } from "@/app/actions/integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

function Status({ state }: { state: ActionState }) {
  if (!state.error && !state.message) return null;
  return <p className={cn("text-xs", state.error ? "text-destructive" : "text-success")}>{state.error ?? state.message}</p>;
}

export function AddAccountForm({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(addAccount, {});
  const [auth, setAuth] = useState("oauth");
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Account name</Label>
        <Input id="name" name="name" placeholder="Account 1" required disabled={disabled} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="location_id">GHL location ID</Label>
        <Input id="location_id" name="location_id" placeholder="ve9EPM428h8vShlRW1KT" required disabled={disabled} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="auth_type">Authentication</Label>
        <NativeSelect id="auth_type" name="auth_type" value={auth} onChange={(e) => setAuth(e.target.value)} disabled={disabled}>
          <option value="oauth">OAuth marketplace app (webhooks)</option>
          <option value="private_integration">Private integration token (polling)</option>
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="credential_env_var">Token env var name</Label>
        <Input id="credential_env_var" name="credential_env_var" placeholder="GHL_PIT_ACCOUNT_1" disabled={disabled || auth === "oauth"} />
      </div>
      <input type="hidden" name="color" value="#2a78d6" />
      <Button type="submit" disabled={disabled || pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Add account
      </Button>
      <div className="sm:col-span-2 lg:col-span-5">
        <Status state={state} />
        <p className="text-[11px] text-muted-foreground">
          Only identifiers are entered here. A private-integration token goes into the server environment (Vercel → Settings → Environment Variables) under the name you enter; OAuth tokens are obtained by the Connect flow and stored encrypted.
        </p>
      </div>
    </form>
  );
}

export function SyncButton({ accountId, disabled }: { accountId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" disabled={disabled || pending} onClick={() => start(async () => setState(await syncNow(accountId)))}>
        <RefreshCw className={cn(pending && "animate-spin")} /> {pending ? "Syncing…" : "Sync now"}
      </Button>
      <Status state={state} />
    </div>
  );
}

const STAGE_CHOICES = [
  ["", "— not mapped —"],
  ["new_lead", "New Lead"],
  ["first_call", "First Sales Call"],
  ["second_call", "Second Sales Call"],
  ["third_call", "Third Sales Call"],
  ["fourth_stage", "Fourth Stage"],
  ["closing", "Closing / Won"],
] as const;

export function MappingForm({
  accountId,
  pipelines,
  calendars,
  disabled,
  stageLabels,
}: {
  accountId: string;
  pipelines: Array<{ id: string; name: string; isSalesPipeline: boolean; stages: Array<{ id: string; name: string; businessStage: string | null }> }>;
  calendars: Array<{ id: string; name: string; callNumber: number | null; isSalesCalendar: boolean }>;
  disabled?: boolean;
  stageLabels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveMappings, {});
  if (!pipelines.length && !calendars.length) return <p className="text-xs text-muted-foreground">Run a sync to load this account&apos;s pipelines and calendars.</p>;
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="account_id" value={accountId} />
      <div className="grid gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline mapping</h4>
        {pipelines.map((p) => (
          <div key={p.id} className="rounded-lg border p-3">
            <input type="hidden" name={`pipeline_seen:${p.id}`} value="1" />
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="sales_pipeline" value={p.id} defaultChecked={p.isSalesPipeline} disabled={disabled} className="size-4 accent-[var(--primary)]" />
              {p.name}
              <span className="text-xs font-normal text-muted-foreground">— count as a sales pipeline</span>
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {p.stages.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="w-40 truncate text-xs" title={s.name}>
                    {s.name}
                  </span>
                  <NativeSelect name={`stage:${s.id}`} defaultValue={s.businessStage ?? ""} disabled={disabled} className="flex-1">
                    {STAGE_CHOICES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {v ? stageLabels[v] ?? l : l}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calendar mapping</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {calendars.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <label className="flex flex-1 items-center gap-2 truncate text-sm">
                <input type="checkbox" name="sales_calendar" value={c.id} defaultChecked={c.isSalesCalendar} disabled={disabled} className="size-4 accent-[var(--primary)]" />
                <span className="truncate">{c.name}</span>
              </label>
              <NativeSelect name={`calnum:${c.id}`} defaultValue={c.callNumber?.toString() ?? ""} disabled={disabled} className="w-36" aria-label="Call number">
                <option value="">By sequence</option>
                <option value="1">Always call 1</option>
                <option value="2">Always call 2</option>
                <option value="3">Always call 3</option>
                <option value="4">Always call 4</option>
              </NativeSelect>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Ticked = sales calendar (counted in call metrics). &quot;By sequence&quot; numbers a lead&apos;s calls in order, advancing only after a completed call, so rebooking a no-show never inflates the count.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={disabled || pending}>
          <Save /> Save mappings
        </Button>
        <Status state={state} />
      </div>
    </form>
  );
}
