import { redirect } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { isDemoMode } from "@/lib/data";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (isDemoMode()) redirect("/");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-background to-accent/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PhoneCall className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold">Sales Call Tracker</h1>
            <p className="text-xs text-muted-foreground">Sign in to continue</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
