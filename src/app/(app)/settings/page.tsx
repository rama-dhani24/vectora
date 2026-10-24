import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  AdminInvitesManager,
  type AdminInviteRow,
} from "@/features/settings/admin-invites-manager";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  let adminInvitations: AdminInviteRow[] = [];
  let availableAdminSeats = 0;
  if (user.role === "owner") {
    const supabase = await createClient();
    const [{ data: inviteRows }, { count: activeAdminCount }] = await Promise.all([
      supabase.rpc("list_group_admin_invites"),
      supabase
        .from("group_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("group_id", user.groupId)
        .eq("role", "admin")
        .eq("status", "active"),
    ]);
    adminInvitations = (inviteRows ?? []) as AdminInviteRow[];
    const pendingInviteCount = adminInvitations.filter(
      (invite) =>
        !invite.accepted_at && !invite.canceled_at && Date.parse(invite.expires_at) > Date.now(),
    ).length;
    availableAdminSeats = Math.max(0, 2 - (activeAdminCount ?? 0) - pendingInviteCount);
  }

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.profile")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">{t("settings.name")}</dt>
                <dd className="font-medium">{user.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("settings.email")}</dt>
                <dd className="font-medium break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("settings.role")}</dt>
                <dd>
                  <Badge variant="secondary">{t(`roles.${user.role}`)}</Badge>
                </dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-muted-foreground">Investment group</dt>
                <dd className="font-medium">{user.groupName}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Private group workspace</CardTitle>
            <CardDescription>
              Investors, challenges, transactions, and reports are scoped to this group.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Your access level is <Badge variant="secondary">{t(`roles.${user.role}`)}</Badge>.
              Other groups cannot access this group&apos;s data.
            </p>
          </CardContent>
        </Card>
        {user.role === "owner" ? (
          <AdminInvitesManager
            invitations={adminInvitations}
            availableSeats={availableAdminSeats}
          />
        ) : null}
      </div>
    </>
  );
}
