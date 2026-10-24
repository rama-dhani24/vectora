"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";

type AuthMessageKey = "invalidCredentials";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const t = useTranslations("auth");
  const [formError, setFormError] = useState<AuthMessageKey | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setFormError("invalidCredentials");
      return;
    }
    window.location.assign(nextPath);
  }

  const emailError = errors.email?.message as string | undefined;
  const passwordError = errors.password?.message as string | undefined;
  return (
    <Card className="border-border/70 shadow-foreground/[0.045] rounded-2xl shadow-xl">
      <CardHeader className="gap-2 px-6 pt-6 sm:px-7 sm:pt-7">
        <CardTitle className="text-xl">{t("signInTitle")}</CardTitle>
        <CardDescription>{t("signInSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6 sm:px-7 sm:pb-7">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              className="bg-background/70 h-11"
              aria-invalid={emailError ? true : undefined}
              {...register("email")}
            />
            {emailError ? <p className="text-destructive text-sm">{t(emailError)}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              className="bg-background/70 h-11"
              aria-invalid={passwordError ? true : undefined}
              {...register("password")}
            />
            {passwordError ? <p className="text-destructive text-sm">{t(passwordError)}</p> : null}
          </div>
          {formError ? (
            <p role="alert" className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
              {t(formError)}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="shadow-primary/15 mt-1 h-11 shadow-md"
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {isSubmitting ? t("signingIn") : t("signIn")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
