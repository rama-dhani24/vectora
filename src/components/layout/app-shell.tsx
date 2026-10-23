"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { NavLinks } from "@/components/layout/nav-links";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SessionUser } from "@/types";

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="bg-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r p-4 lg:flex">
        <div className="flex items-center justify-between">
          <Brand />
          <div className="flex">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <Separator className="my-4" />
        <div className="flex-1 overflow-y-auto">
          <NavLinks role={user.role} />
        </div>
        <Separator className="my-4" />
        <UserMenu user={user} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" aria-label={t("openMenu")} />}
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col p-4">
              <SheetTitle className="sr-only">{t("mainNavigation")}</SheetTitle>
              <Brand />
              <Separator className="my-4" />
              <div className="flex-1 overflow-y-auto">
                <NavLinks role={user.role} onNavigate={() => setOpen(false)} />
              </div>
              <Separator className="my-4" />
              <UserMenu user={user} />
            </SheetContent>
          </Sheet>
          <Brand />
          <div className="ml-auto flex">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
