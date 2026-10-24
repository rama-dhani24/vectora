"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function SetPasswordForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Enter your name (at least 2 characters).");
      return;
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { data, error: updateError } = await supabase.auth.updateUser({
      password,
      data: { full_name: name.trim() },
    });
    if (updateError || !data.user) {
      setPending(false);
      setError(updateError?.message ?? "Could not finish setting up your account.");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: name.trim() })
      .eq("id", data.user.id);
    setPending(false);
    if (profileError) {
      setError("Your password was saved, but we could not save your name. Please try again.");
      return;
    }

    toast.success("Your admin account is ready.");
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Card className="border-border/70 rounded-2xl shadow-xl">
      <CardHeader className="gap-2 px-6 pt-6 sm:px-7 sm:pt-7">
        <CardTitle className="text-xl">Finish setting up your Vectora account</CardTitle>
        <CardDescription>
          Choose your name and password to access your investment group as an Admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6 sm:px-7 sm:pb-7">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-name">Your name</Label>
            <Input
              id="admin-name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-password">Create password</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-password-confirm">Confirm password</Label>
            <Input
              id="admin-password-confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          {error ? (
            <p role="alert" className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending ? "Saving account..." : "Finish account setup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
