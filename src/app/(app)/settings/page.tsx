import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listUsers } from "@/features/users/queries";
import { UsersManager } from "@/features/users/users-manager";
import { requireUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const users = can.manageUsers(user.role) ? await listUsers() : null;

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
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.users")}</CardTitle>
            <CardDescription>
              {users ? t("settings.usersDescription") : t("settings.readOnly")}
            </CardDescription>
          </CardHeader>
          {users ? (
            <CardContent>
              <UsersManager users={users} currentUid={user.uid} />
            </CardContent>
          ) : null}
        </Card>
      </div>
    </>
  );
}
