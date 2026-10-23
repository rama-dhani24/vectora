"use client";

import ExcelJS from "exceljs";
import { Search, Upload, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bulkCreateInvestorsAction,
  deleteInvestorAction,
  saveInvestorAction,
} from "@/features/data/actions";
import { excelCellText, parseInvestorRows } from "@/lib/import/parse-investor-rows";
import type { Investor } from "@/types";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function InvestorsManager({ investors }: { investors: Investor[] }) {
  const t = useTranslations("features.investors");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Investor | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return investors.filter(
      (item) => !query || `${item.name} ${item.phone ?? ""}`.toLowerCase().includes(query),
    );
  }, [investors, search]);

  async function submitInvestor(formData: FormData) {
    const result = await saveInvestorAction(selected?.id ?? null, {
      name: formData.get("name"),
      phone: formData.get("phone"),
      notes: formData.get("notes"),
      status: formData.get("status"),
    });
    if (result.ok) {
      toast.success(selected ? t("updated") : t("created"));
      setSelected(null);
    } else toast.error(result.error);
  }

  async function importCsv(file: File) {
    let rows: string[][];
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error(t("csvEmpty"));
      rows = [];
      worksheet.eachRow((row) => {
        rows.push(
          Array.from({ length: Math.max(row.cellCount, worksheet.columnCount) }, (_, index) =>
            excelCellText(row.getCell(index + 1)),
          ),
        );
      });
    } else if (file.name.toLowerCase().endsWith(".csv")) {
      rows = parseCsv(await file.text());
    } else {
      throw new Error(t("fileType"));
    }
    if (!rows.length) throw new Error(t("csvEmpty"));
    let data: ReturnType<typeof parseInvestorRows>;
    try {
      data = parseInvestorRows(rows);
    } catch (error) {
      if (error instanceof Error && error.message === "csvNameColumn") {
        throw new Error(t("csvNameColumn"));
      }
      throw error;
    }
    if (!data.length) throw new Error(t("csvNoRows"));
    const result = await bulkCreateInvestorsAction(data);
    if (result.ok) toast.success(`${data.length} ${t("created")}`);
    else toast.error(result.error);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" aria-hidden />
          <Input
            aria-label={t("searchLabel")}
            className="pl-9"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <label className="hover:bg-muted inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium">
          <Upload className="size-4" aria-hidden />
          {t("importCsv")}
          <input
            className="sr-only"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              startTransition(() => {
                void importCsv(file).catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : t("csvReadError")),
                );
              });
              event.target.value = "";
            }}
          />
        </label>
        <Button type="button" onClick={() => setSelected(null)}>
          <UserPlus className="size-4" aria-hidden />
          {t("add")}
        </Button>
      </div>

      <form
        key={selected?.id ?? "new"}
        action={(data) => {
          startTransition(() => {
            void submitInvestor(data);
          });
        }}
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="space-y-1">
          <Label htmlFor="investor-name">{t("fullName")}</Label>
          <Input
            id="investor-name"
            name="name"
            required
            maxLength={120}
            defaultValue={selected?.name ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="investor-phone">{t("phone")}</Label>
          <Input
            id="investor-phone"
            name="phone"
            maxLength={40}
            defaultValue={selected?.phone ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="investor-notes">{t("notes")}</Label>
          <Input
            id="investor-notes"
            name="notes"
            maxLength={2000}
            defaultValue={selected?.notes ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="investor-status">{t("status")}</Label>
          <select
            id="investor-status"
            name="status"
            defaultValue={selected?.status ?? "active"}
            className="form-control"
          >
            <option value="active">{t("active")}</option>
            <option value="inactive">{t("inactive")}</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button disabled={pending} type="submit">
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
              <th className="px-4 py-3">{t("investor")}</th>
              <th className="px-4 py-3">{t("phone")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3 text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((investor) => (
              <tr key={investor.id} className="border-t">
                <td className="px-4 py-3 font-medium">{investor.name}</td>
                <td className="px-4 py-3">{investor.phone || "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={investor.status === "active" ? "secondary" : "outline"}>
                    {investor.status === "active" ? t("active") : t("inactive")}
                  </Badge>
                </td>
                <td className="space-x-2 px-4 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => setSelected(investor)}>
                    {t("edit")}
                  </Button>
                  {investor.status === "inactive" ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          if (!window.confirm(t("confirmDelete"))) return;
                          const result = await deleteInvestorAction(investor.id);
                          if (result.ok) toast.success(t("deleted"));
                          else toast.error(result.error);
                        })
                      }
                    >
                      {t("delete")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!visible.length ? (
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
