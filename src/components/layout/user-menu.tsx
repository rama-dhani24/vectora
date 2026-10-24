"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { SessionUser } from "@/types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ user }: { user: SessionUser }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await createClient().auth.signOut();
      toast.success(t("auth.signedOut"));
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>{initials(user.name) || "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <Badge variant="secondary" className="mt-0.5">
          {t(`roles.${user.role}`)}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSignOut}
        disabled={pending}
        aria-label={t("nav.logout")}
        title={t("nav.logout")}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
