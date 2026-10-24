"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { signupSchema, type SignupInput } from "@/lib/validators/auth";

export function SignupForm({ inviteToken }: { inviteToken?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { groupName: inviteToken ? "Admin invite" : "" },
  });

  async function onSubmit(values: SignupInput) {
    setError(null);
    const supabase = createClient();
    const { data, error: signupError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: inviteToken
          ? { full_name: values.name, admin_invite: inviteToken }
          : { full_name: values.name, group_name: values.groupName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (signupError) {
      const message = signupError.message.toLowerCase();
      const code = signupError.code?.toLowerCase();
      if (message.includes("already") || code === "user_already_exists") {
        setError("A user with this email already exists.");
      } else if (code === "email_address_not_authorized") {
        setError(
          "Supabase's default email service can only send to project team members. Add this address to your Supabase organization or configure custom SMTP.",
        );
      } else if (code === "over_email_send_rate_limit") {
        setError("Too many emails were requested. Wait a while, then try signing up again.");
      } else if (message.includes("error sending confirmation email")) {
        setError(
          "Supabase could not send the confirmation email. Check Authentication → Logs and your SMTP settings. Also confirm the Confirm signup template contains {{ .Token }} for OTP.",
        );
      } else {
        setError(signupError.message);
      }
      return;
    }
    if (!data.session) {
      setPendingEmail(values.email);
      return;
    }
    toast.success("Your group is ready.");
    router.replace("/dashboard");
    router.refresh();
  }

  async function verifyEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingEmail || !/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    setIsVerifying(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: otp,
      type: "signup",
    });
    setIsVerifying(false);
    if (verifyError) {
      setError("That code is invalid or expired. Check the code or request a new one.");
      return;
    }
    toast.success("Your email is verified and your group is ready.");
    router.replace("/dashboard");
    router.refresh();
  }

  async function resendOtp() {
    if (!pendingEmail) return;
    setError(null);
    setIsResending(true);
    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
    });
    setIsResending(false);
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setOtp("");
    toast.success("A new verification code was sent.");
  }

  if (pendingEmail) {
    return (
      <Card className="border-border/70 rounded-2xl shadow-xl">
        <CardHeader className="gap-2 px-6 pt-6 sm:px-7 sm:pt-7">
          <CardTitle className="text-xl">Verify your email</CardTitle>
          <CardDescription>
            Enter the 6-digit code from the email or use its confirmation link to verify{" "}
            <span className="text-foreground font-medium">{pendingEmail}</span> to activate your
            account and open your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6 sm:px-7 sm:pb-7">
          <form onSubmit={verifyEmail} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="signup-otp">Verification code</Label>
              <Input
                id="signup-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                aria-invalid={error ? true : undefined}
                className="bg-background/70 h-12 text-center text-lg tracking-[0.4em]"
                autoFocus
              />
            </div>
            {error ? (
              <p role="alert" className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" disabled={isVerifying || otp.length !== 6}>
              {isVerifying ? <Loader2 className="size-4 animate-spin" /> : null}
              {isVerifying ? "Verifying..." : "Verify email"}
            </Button>
            <Button type="button" variant="outline" onClick={resendOtp} disabled={isResending}>
              {isResending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isResending ? "Sending code..." : "Resend code"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border/70 rounded-2xl shadow-xl">
      <CardHeader className="gap-2 px-6 pt-6 sm:px-7 sm:pt-7">
        <CardTitle className="text-xl">
          {inviteToken ? "Create your Admin account" : "Create your group"}
        </CardTitle>
        <CardDescription>
          {inviteToken
            ? "This invitation joins your account to the group as an Admin. Use the invited email address."
            : "Your account will be the Super Admin of this private workspace."}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6 sm:px-7 sm:pb-7">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={errors.name ? true : undefined}
              {...register("name")}
            />
            {errors.name ? <p className="text-destructive text-sm">{errors.name.message}</p> : null}
          </div>
          {!inviteToken ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="groupName">Group name</Label>
              <Input
                id="groupName"
                autoComplete="organization"
                placeholder="e.g. Tanzania Investment Group"
                aria-invalid={errors.groupName ? true : undefined}
                {...register("groupName")}
              />
              {errors.groupName ? (
                <p className="text-destructive text-sm">{errors.groupName.message}</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-destructive text-sm">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-destructive text-sm">{errors.password.message}</p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {isSubmitting ? "Creating group…" : "Create group and account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
