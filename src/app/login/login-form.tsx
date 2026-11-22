"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ error?: string; info?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg({});
    const supabase = createBrowserSupabase();
    const res =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setBusy(false);
    if (res.error) return setMsg({ error: res.error.message });
    if (mode === "signup" && !res.data.session) return setMsg({ info: "Check your email to confirm your account." });
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {msg.error && <p className="text-xs text-destructive">{msg.error}</p>}
      {msg.info && <p className="text-xs text-success">{msg.info}</p>}
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} {mode === "signin" ? "Sign in" : "Create account"}
      </Button>
      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
      <p className="text-[11px] leading-relaxed text-muted-foreground">The first account becomes the admin. Later sign-ups stay inactive until an admin assigns a role.</p>
    </form>
  );
}
