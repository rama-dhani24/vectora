"use client";

import { useState, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelAdminInviteAction, createAdminInviteAction } from "@/features/settings/actions";

export interface AdminInviteRow {
  invite_id: string;
  invited_email: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  canceled_at: string | null;
}

export function AdminInvitesManager({
  invitations,
  availableSeats,
}: {
  invitations: AdminInviteRow[];
  availableSeats: number;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCanceling, setIsCanceling] = useState<string | null>(null);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsCreating(true);
    const result = await createAdminInviteAction(email);
    setIsCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail("");
    toast.success("Admin invitation sent by email.");
  }

  async function cancelInvite(id: string) {
    setIsCanceling(id);
    const result = await cancelAdminInviteAction(id);
    setIsCanceling(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Invitation canceled.");
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Group administrators</CardTitle>
        <CardDescription>
          As Super Admin, invite up to two people as Admins. We will email a secure setup link to the
          address you enter. The invitation is tied to that email address.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between rounded-xl border p-4 text-sm">
          <span>Admin seats available</span>
          <Badge variant="secondary">{availableSeats} of 2</Badge>
        </div>

        {availableSeats > 0 ? (
          <form onSubmit={createInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="admin-invite-email">Admin email</Label>
              <Input
                id="admin-invite-email"
                type="email"
                autoComplete="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? <Loader2 className="size-4 animate-spin" /> : null}
              Send invitation
            </Button>
          </form>
        ) : null}

        {error ? (
          <p role="alert" className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            {error}
          </p>
        ) : null}

        {invitations.length ? (
          <ul className="divide-y rounded-xl border">
            {invitations.map((invite) => {
              const expired =
                !invite.accepted_at &&
                !invite.canceled_at &&
                Date.now() > Date.parse(invite.expires_at);
              const status = invite.canceled_at
                ? "Canceled"
                : invite.accepted_at
                  ? "Accepted"
                  : expired
                    ? "Expired"
                    : "Pending";
              return (
                <li
                  key={invite.invite_id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{invite.invited_email}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {status === "Pending" ? `Expires ${formatDate(invite.expires_at)}` : status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        status === "Pending" || status === "Accepted" ? "secondary" : "outline"
                      }
                    >
                      {status}
                    </Badge>
                    {status === "Pending" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Cancel invite for ${invite.invited_email}`}
                        disabled={isCanceling === invite.invite_id}
                        onClick={() => void cancelInvite(invite.invite_id)}
                      >
                        {isCanceling === invite.invite_id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <X className="size-4" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-xl border border-dashed p-5 text-center text-sm">
            No Admin invitations yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
