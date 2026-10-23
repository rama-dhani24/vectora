"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createUserAction,
  setUserDisabledAction,
  updateUserRoleAction,
  type ActionResult,
} from "@/features/users/actions";
import { isUserRole } from "@/lib/auth/roles";
import { createUserSchema, type CreateUserInput } from "@/lib/validators/auth";
import { USER_ROLES, type UserProfile, type UserRole } from "@/types";

function RoleSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("roles");
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (isUserRole(next)) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-40">
        <SelectValue>
          {(selected: unknown) => (isUserRole(selected) ? t(selected) : "")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {USER_ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {t(role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddUserDialog() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", password: "", role: "admin" },
  });

  async function onSubmit(values: CreateUserInput) {
    const result = await createUserAction(values);
    if (result.ok) {
      toast.success(t("userCreated"));
      reset();
      setOpen(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlus className="size-4" /> {t("addUser")}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("addUser")}</DialogTitle>
            <DialogDescription>{t("passwordHint")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-name">{t("name")}</Label>
            <Input
              id="new-name"
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              {...register("name")}
            />
            {errors.name ? <p className="text-destructive text-sm">{errors.name.message}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-email">{t("email")}</Label>
            <Input
              id="new-email"
              type="email"
              autoComplete="off"
              aria-invalid={errors.email ? true : undefined}
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-destructive text-sm">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{t("temporaryPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-destructive text-sm">{errors.password.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-role">{t("role")}</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <RoleSelect id="new-role" value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {tc("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ user, isSelf }: { user: UserProfile; isSelf: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(successMessage);
      else toast.error(result.error);
    });
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">
          {user.name} {isSelf ? <Badge variant="outline">{t("you")}</Badge> : null}
        </div>
        <div className="text-muted-foreground text-xs break-all">{user.email}</div>
      </TableCell>
      <TableCell>
        <RoleSelect
          value={user.role}
          disabled={isSelf || pending}
          onChange={(role) => run(() => updateUserRoleAction(user.uid, role), t("roleUpdated"))}
        />
      </TableCell>
      <TableCell>
        <Badge variant={user.disabled ? "destructive" : "secondary"}>
          {user.disabled ? t("disabled") : t("active")}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {isSelf ? null : (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={pending} />}>
              {user.disabled ? t("enable") : t("disable")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {user.disabled ? t("enable") : t("disable")}: {user.name}
                </AlertDialogTitle>
                <AlertDialogDescription>{user.email}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant={user.disabled ? "default" : "destructive"}
                  onClick={() =>
                    run(() => setUserDisabledAction(user.uid, !user.disabled), t("statusUpdated"))
                  }
                >
                  {user.disabled ? t("enable") : t("disable")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </TableCell>
    </TableRow>
  );
}

export function UsersManager({ users, currentUid }: { users: UserProfile[]; currentUid: string }) {
  const t = useTranslations("settings");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <AddUserDialog />
      </div>
      {users.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("noUsers")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">{t("changeRole")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <UserRow key={user.uid} user={user} isSelf={user.uid === currentUid} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
