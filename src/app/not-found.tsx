import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <h1 className="text-lg font-semibold">Not found</h1>
      <Link href="/" className="text-sm text-primary hover:underline">
        Back to overview
      </Link>
    </div>
  );
}
