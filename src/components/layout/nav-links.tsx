"use client";

import {
  ArrowLeftRight,
  FileSpreadsheet,
  LayoutDashboard,
  type LucideIcon,
  PieChart,
  Settings,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { navItemsFor, type NavKey } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

const ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  challenges: Trophy,
  transactions: ArrowLeftRight,
  investors: Users,
  reports: PieChart,
  import: FileSpreadsheet,
  settings: Settings,
};

export function NavLinks({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("mainNavigation")} className="flex flex-col gap-1">
      {navItemsFor(role).map((item) => {
        const Icon = ICONS[item.key];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              "focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
              active
                ? "bg-primary text-primary-foreground shadow-primary/15 shadow-md"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5",
            )}
          >
            <Icon
              className="size-[17px] opacity-85 transition-transform group-hover:scale-105"
              aria-hidden
            />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
