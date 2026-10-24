import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SignupForm } from "@/features/auth/signup-form";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Create your group" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const query = await searchParams;
  const rawInvite = Array.isArray(query.invite) ? query.invite[0] : query.invite;
  const inviteToken = rawInvite && /^[0-9a-f-]{36}$/i.test(rawInvite) ? rawInvite : undefined;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between p-4 sm:px-8 sm:py-6">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-4 pb-10 sm:px-8 lg:grid-cols-2">
        <section>
          <p className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">
            VECTORA WORKSPACES
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            A dedicated space for your investment group.
          </h1>
          <p className="text-muted-foreground mt-4 leading-7">
            Create your group to manage investors, contributions, challenges, and reports in a
            private workspace.
          </p>
        </section>
        <div>
          <SignupForm inviteToken={inviteToken} />
          <p className="text-muted-foreground mt-5 text-center text-sm">
            Already have an account?{" "}
            <Link href="/login" className="text-primary underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
