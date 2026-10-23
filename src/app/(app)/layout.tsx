import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/dal";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
