import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Brand } from "@/components/layout/brand";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/redirect";
import { ArrowUpRight, ShieldCheck, TrendingUp } from "lucide-react";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : undefined);
  if (await getCurrentUser()) redirect(nextPath);

  const t = await getTranslations("app");
  const auth = await getTranslations("auth");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative z-10 flex items-center justify-between p-4 sm:px-8 sm:py-6">
        <Brand />
        <div className="flex">
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-4 pb-10 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:px-12">
        <section className="bg-primary text-primary-foreground shadow-primary/15 relative hidden overflow-hidden rounded-[2rem] px-10 py-12 shadow-2xl lg:flex lg:min-h-[560px] lg:flex-col lg:justify-between xl:px-14 xl:py-14">
          <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full border border-current/10" />
          <div className="pointer-events-none absolute top-10 -right-5 size-72 rounded-full border border-current/10" />
          <div className="relative">
            <div className="mb-12 flex size-14 items-center justify-center rounded-2xl bg-white/12">
              <TrendingUp className="size-7" />
            </div>
            <p className="text-primary-foreground/70 mb-4 text-xs font-semibold tracking-[0.2em] uppercase">
              {auth("portalLabel")}
            </p>
            <h1 className="max-w-lg text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">
              {auth("portalHeadline")}
            </h1>
            <p className="text-primary-foreground/75 mt-5 max-w-md text-base leading-7">
              {auth("portalDescription")}
            </p>
          </div>
          <div className="relative flex items-center justify-between rounded-2xl border border-white/15 bg-white/[0.08] p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/10">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{auth("secureWorkspace")}</p>
                <p className="text-primary-foreground/65 mt-0.5 text-xs">{auth("adminAccess")}</p>
              </div>
            </div>
            <ArrowUpRight className="size-5 opacity-65" />
          </div>
        </section>
        <div className="mx-auto w-full max-w-md">
          <p className="text-muted-foreground mb-5 text-sm leading-6 lg:hidden">{t("subtitle")}</p>
          <div className="mb-6 hidden lg:block">
            <p className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">
              {auth("portalLabel")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{auth("signInHeading")}</h2>
            <p className="text-muted-foreground mt-2 text-sm">{t("subtitle")}</p>
          </div>
          <LoginForm nextPath={nextPath} />
          <p className="text-muted-foreground mt-5 text-center text-xs">
            {auth("secureWorkspace")}
          </p>
        </div>
      </main>
    </div>
  );
}
