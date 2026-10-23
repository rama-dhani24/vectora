"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveChallengeAction, setChallengeStatusAction } from "@/features/data/actions";
import type { ChallengeSummary, UserRole } from "@/types";

export function ChallengesManager({
  challenges,
  role,
}: {
  challenges: ChallengeSummary[];
  role: UserRole;
}) {
  const t = useTranslations("features.challenges");
  const [selected, setSelected] = useState<ChallengeSummary | null>(null);
  const [pending, startTransition] = useTransition();

  async function save(formData: FormData) {
    const result = await saveChallengeAction(selected?.id ?? null, {
      title: formData.get("title"),
      month: formData.get("month"),
      year: formData.get("year"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      status: selected?.status ?? "draft",
    });
    if (result.ok) {
      toast.success(selected ? t("updated") : t("created"));
      setSelected(null);
    } else toast.error(result.error);
  }

  function updateStatus(challenge: ChallengeSummary, status: "open" | "closed") {
    if (status === "closed" && !window.confirm(t("confirmClose"))) return;
    startTransition(async () => {
      const result = await setChallengeStatusAction(challenge.id, status);
      if (result.ok)
        toast.success(
          status === "open"
            ? challenge.status === "closed"
              ? t("reopened")
              : t("opened")
            : t("closed"),
        );
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <form
        key={selected?.id ?? "new"}
        action={(formData) => startTransition(() => void save(formData))}
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="challenge-title">{t("title")}</Label>
          <Input
            id="challenge-title"
            name="title"
            required
            minLength={3}
            maxLength={120}
            defaultValue={selected?.title ?? ""}
            placeholder={t("placeholder")}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="challenge-month">{t("month")}</Label>
          <Input
            id="challenge-month"
            name="month"
            type="number"
            min={1}
            max={12}
            required
            defaultValue={selected?.month ?? new Date().getMonth() + 1}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="challenge-year">{t("year")}</Label>
          <Input
            id="challenge-year"
            name="year"
            type="number"
            min={2000}
            max={2200}
            required
            defaultValue={selected?.year ?? new Date().getFullYear()}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="challenge-start">{t("startDate")}</Label>
          <Input
            id="challenge-start"
            name="startDate"
            type="date"
            required
            defaultValue={selected?.startDate ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="challenge-end">{t("endDate")}</Label>
          <Input
            id="challenge-end"
            name="endDate"
            type="date"
            required
            defaultValue={selected?.endDate ?? ""}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={pending}>
            {selected ? t("save") : t("create")}
          </Button>
          {selected ? (
            <Button type="button" variant="outline" onClick={() => setSelected(null)}>
              {t("cancel")}
            </Button>
          ) : null}
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("challenge")}</th>
              <th className="px-4 py-3">{t("dates")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3 text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {challenges.map((challenge) => (
              <tr key={challenge.id} className="border-t">
                <td className="px-4 py-3 font-medium">{challenge.title}</td>
                <td className="px-4 py-3">
                  {challenge.startDate} – {challenge.endDate}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={challenge.status === "open" ? "default" : "secondary"}>
                    {challenge.status}
                  </Badge>
                </td>
                <td className="space-x-2 px-4 py-3 text-right">
                  {challenge.status !== "closed" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setSelected(challenge)}
                      >
                        {t("edit")}
                      </Button>
                      {challenge.status === "draft" ? (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => updateStatus(challenge, "open")}
                        >
                          {t("open")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={pending}
                          onClick={() => updateStatus(challenge, "closed")}
                        >
                          {t("close")}
                        </Button>
                      )}
                    </>
                  ) : role === "super_admin" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => updateStatus(challenge, "open")}
                    >
                      {t("reopen")}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">{t("locked")}</span>
                  )}
                </td>
              </tr>
            ))}
            {!challenges.length ? (
              <tr>
                <td className="text-muted-foreground px-4 py-8 text-center" colSpan={4}>
                  {t("empty")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
