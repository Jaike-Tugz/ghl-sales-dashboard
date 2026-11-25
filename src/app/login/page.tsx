import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { isDemoMode } from "@/lib/data";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (isDemoMode()) redirect("/");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-background to-accent/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8">
        <div className="mb-8">
          <Logo className="h-6" />
          <h1 className="mt-6 text-base font-semibold">Sales Call Tracker</h1>
          <p className="mt-1 text-xs text-muted-foreground">Sign in to continue</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
