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
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
