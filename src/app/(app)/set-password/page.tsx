import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SetPasswordForm } from "@/features/auth/set-password-form";

export const metadata: Metadata = { title: "Set up your account" };

export default function SetPasswordPage() {
  return (
    <>
      <PageHeader title="Account setup" />
      <div className="mx-auto w-full max-w-xl">
        <SetPasswordForm />
      </div>
    </>
  );
}
