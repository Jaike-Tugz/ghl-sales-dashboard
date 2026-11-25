import { Clock } from "lucide-react";

export const metadata = { title: "Awaiting access" };

export default function PendingPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="max-w-sm rounded-2xl border bg-card p-8 text-center">
        <Clock className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-base font-semibold">Your account is awaiting approval</h1>
        <p className="mt-2 text-sm text-muted-foreground">An administrator needs to activate your account and assign your role and sub-accounts.</p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="text-xs text-muted-foreground underline">Sign out</button>
        </form>
      </div>
    </div>
  );
}
