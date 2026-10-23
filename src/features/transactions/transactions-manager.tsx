"use client";

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Check, ClipboardPaste, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteTransactionAction,
  saveInvestorAction,
  saveTransactionAction,
  setTransactionStatusAction,
} from "@/features/data/actions";
import { getClientServices } from "@/lib/firebase/client";
import { formatTzs } from "@/lib/money";
import type { Challenge, Investor, Transaction } from "@/types";

function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Proof must be an image."));
  return createImageBitmap(file).then(
    (bitmap) =>
      new Promise<File>((resolve, reject) => {
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          bitmap.close();
          reject(new Error("Image compression is not supported by this browser."));
          return;
        }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not compress the proof image."));
              return;
            }
            resolve(
              new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }),
            );
          },
          "image/jpeg",
          0.82,
        );
      }),
  );
}

async function uploadProof(
  file: File,
  challengeId: string,
): Promise<{ url: string; path: string }> {
  const image = await compressImage(file);
  if (image.size >= 5 * 1024 * 1024) {
    throw new Error("Proof images must be smaller than 5 MB after compression.");
  }
  const path = `proofs/${challengeId}/${crypto.randomUUID()}.jpg`;
  const storage = getClientServices().storage;
  const uploaded = await uploadBytes(ref(storage, path), image, { contentType: "image/jpeg" });
  return { url: await getDownloadURL(uploaded.ref), path };
}

export function TransactionsManager({
  transactions,
  challenges,
  investors,
}: {
  transactions: Transaction[];
  challenges: Challenge[];
  investors: Investor[];
}) {
  const t = useTranslations("features.transactions");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [investorSearch, setInvestorSearch] = useState("");
  const [selectedInvestorId, setSelectedInvestorId] = useState("");
  const [newInvestorName, setNewInvestorName] = useState("");
  const [createdInvestor, setCreatedInvestor] = useState<{ id: string; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [challengeFilter, setChallengeFilter] = useState("all");
  const [investorFilter, setInvestorFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [quickAdd, setQuickAdd] = useState(true);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          (statusFilter === "all" || transaction.status === statusFilter) &&
          (challengeFilter === "all" || transaction.challengeId === challengeFilter) &&
          (investorFilter === "all" || transaction.investorId === investorFilter) &&
          (typeFilter === "all" || transaction.type === typeFilter) &&
          (!startDate || transaction.date >= startDate) &&
          (!endDate || transaction.date <= endDate),
      ),
    [transactions, statusFilter, challengeFilter, investorFilter, typeFilter, startDate, endDate],
  );

  async function submit(formData: FormData) {
    const challengeId = String(formData.get("challengeId") ?? "");
    let uploaded = { url: "", path: "" };
    if (proof) uploaded = await uploadProof(proof, challengeId);
    const result = await saveTransactionAction(editing?.id ?? null, {
      challengeId,
      investorId: formData.get("investorId"),
      type: formData.get("type"),
      amount: Number(formData.get("amount")),
      date: formData.get("date"),
      institution: formData.get("institution"),
      reference: formData.get("reference"),
      proofUrl: uploaded.url || editing?.proofUrl || "",
      proofPath: uploaded.path || editing?.proofPath || "",
      rawMessage: formData.get("rawMessage"),
      notes: formData.get("notes"),
      source: "manual",
      allowDuplicate: duplicateConfirmed,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.duplicate) {
      setDuplicateConfirmed(true);
      toast.warning(t("duplicateWarning"));
      return;
    }
    toast.success(editing ? t("updated") : t("created"));
    const selectedChallenge = formData.get("challengeId");
    const selectedType = formData.get("type");
    setEditing(null);
    setSelectedInvestorId("");
    formRef.current?.reset();
    if (quickAdd && formRef.current) {
      const challengeSelect = formRef.current.elements.namedItem(
        "challengeId",
      ) as HTMLSelectElement | null;
      const typeSelect = formRef.current.elements.namedItem("type") as HTMLSelectElement | null;
      if (challengeSelect) challengeSelect.value = String(selectedChallenge);
      if (typeSelect) typeSelect.value = String(selectedType);
    }
    setProof(null);
    setDuplicateConfirmed(false);
  }

  function updateStatus(id: string, status: "verified" | "rejected") {
    startTransition(async () => {
      const result = await setTransactionStatusAction(id, status);
      if (result.ok) toast.success(t(status));
      else toast.error(result.error);
    });
  }

  function createInvestorInline() {
    startTransition(async () => {
      const name = newInvestorName.trim();
      const result = await saveInvestorAction(null, {
        name,
        phone: "",
        notes: "",
        status: "active",
      });
      if (!result.ok || !result.id) {
        toast.error(result.ok ? "Investor could not be added." : result.error);
        return;
      }
      setCreatedInvestor({ id: result.id, name });
      setSelectedInvestorId(result.id);
      setInvestorSearch("");
      setNewInvestorName("");
      toast.success("Investor created.");
      router.refresh();
    });
  }

  const columns: ColumnDef<Transaction>[] = [
    {
      id: "dateInvestor",
      header: t("dateInvestor"),
      cell: ({ row }) => (
        <>
          <div>{row.original.date}</div>
          <div className="font-medium">{row.original.investorName}</div>
        </>
      ),
    },
    {
      id: "challenge",
      header: t("challenge"),
      cell: ({ row }) =>
        challenges.find((challenge) => challenge.id === row.original.challengeId)?.title ?? "—",
    },
    {
      id: "type",
      header: t("type"),
      cell: ({ row }) => (row.original.type === "UNITS" ? t("units") : t("stock")),
    },
    {
      id: "amount",
      header: t("amountHeader"),
      cell: ({ row }) => formatTzs(row.original.amount),
    },
    {
      id: "status",
      header: t("statusHeader"),
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.status === "verified"
              ? "default"
              : row.original.status === "rejected"
                ? "destructive"
                : "secondary"
          }
        >
          {t(row.original.status)}
        </Badge>
      ),
    },
    {
      id: "proof",
      header: t("proofHeader"),
      cell: ({ row }) =>
        row.original.proofUrl ? (
          <a
            href={row.original.proofUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {t("view")}
          </a>
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      header: t("actions"),
      cell: ({ row }) => {
        const item = row.original;
        const isOpen =
          challenges.find((challenge) => challenge.id === item.challengeId)?.status === "open";
        return (
          <div className="space-x-1 text-right">
            {isOpen ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(item);
                  setProof(null);
                  setSelectedInvestorId(item.investorId);
                }}
              >
                {t("edit")}
              </Button>
            ) : null}
            {item.status !== "verified" ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("verify")}
                onClick={() => updateStatus(item.id, "verified")}
              >
                <Check className="size-4" />
              </Button>
            ) : null}
            {item.status !== "rejected" ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("reject")}
                onClick={() => updateStatus(item.id, "rejected")}
              >
                <X className="size-4" />
              </Button>
            ) : null}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("delete")}
              onClick={() =>
                startTransition(async () => {
                  if (!window.confirm(t("confirmDelete"))) return;
                  const result = await deleteTransactionAction(item.id);
                  if (result.ok) toast.success(t("deleted"));
                  else toast.error(result.error);
                })
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      },
    },
  ];
  const table = useReactTable({ data: visible, columns, getCoreRowModel: getCoreRowModel() });
  const exportParams = new URLSearchParams({ format: "xlsx", scope: "transactions" });
  if (challengeFilter !== "all") exportParams.set("challengeId", challengeFilter);
  if (investorFilter !== "all") exportParams.set("investorId", investorFilter);
  if (typeFilter !== "all") exportParams.set("type", typeFilter);
  if (statusFilter !== "all") exportParams.set("status", statusFilter);
  if (startDate) exportParams.set("startDate", startDate);
  if (endDate) exportParams.set("endDate", endDate);

  return (
    <div
      className="space-y-5"
      onPaste={(event) => {
        const image = Array.from(event.clipboardData.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (image) setProof(image);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const image = Array.from(event.dataTransfer.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (image) setProof(image);
      }}
    >
      <form
        key={editing?.id ?? "new"}
        ref={formRef}
        action={(formData) => {
          startTransition(() => {
            void submit(formData).catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : "Could not save transaction."),
            );
          });
        }}
        onChange={() => {
          if (duplicateConfirmed) setDuplicateConfirmed(false);
        }}
        className="grid gap-3 rounded-xl border p-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="transaction-challenge">{t("challenge")}</Label>
          <select
            id="transaction-challenge"
            name="challengeId"
            required
            className="form-control"
            defaultValue={
              editing?.challengeId ?? challenges.find((item) => item.status === "open")?.id ?? ""
            }
          >
            <option value="">{t("selectChallenge")}</option>
            {challenges
              .filter((item) => item.status === "open" || item.id === editing?.challengeId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="transaction-investor">{t("investor")}</Label>
          <Input
            aria-label={t("investor")}
            placeholder={t("investorSearch")}
            value={investorSearch}
            onChange={(event) => setInvestorSearch(event.target.value)}
          />
          <select
            id="transaction-investor"
            name="investorId"
            required
            className="form-control"
            value={selectedInvestorId || editing?.investorId || ""}
            onChange={(event) => setSelectedInvestorId(event.target.value)}
          >
            <option value="">{t("selectInvestor")}</option>
            {createdInvestor ? (
              <option value={createdInvestor.id}>{createdInvestor.name}</option>
            ) : null}
            {investors
              .filter(
                (item) =>
                  (item.status === "active" || item.id === editing?.investorId) &&
                  (!investorSearch ||
                    item.name.toLowerCase().includes(investorSearch.toLowerCase())),
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <div className="flex gap-2">
            <Input
              aria-label={t("newInvestor")}
              placeholder={t("newInvestor")}
              value={newInvestorName}
              onChange={(event) => setNewInvestorName(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending || !newInvestorName.trim()}
              onClick={createInvestorInline}
            >
              {t("addInvestor")}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="transaction-type">{t("type")}</Label>
          <select
            id="transaction-type"
            name="type"
            className="form-control"
            defaultValue={editing?.type ?? "UNITS"}
          >
            <option value="UNITS">{t("units")}</option>
            <option value="STOCK_MARKET">{t("stock")}</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="transaction-amount">{t("amount")}</Label>
          <Input
            id="transaction-amount"
            name="amount"
            type="number"
            min={1}
            step={1}
            required
            inputMode="numeric"
            defaultValue={editing?.amount ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="transaction-date">{t("date")}</Label>
          <Input
            id="transaction-date"
            name="date"
            type="date"
            required
            defaultValue={editing?.date ?? new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="transaction-institution">{t("institution")}</Label>
          <Input
            id="transaction-institution"
            name="institution"
            maxLength={160}
            placeholder={t("institutionPlaceholder")}
            defaultValue={editing?.institution ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="transaction-reference">{t("reference")}</Label>
          <Input
            id="transaction-reference"
            name="reference"
            maxLength={120}
            defaultValue={editing?.reference ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="transaction-proof">{t("proof")}</Label>
          <Input
            id="transaction-proof"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setProof(event.target.files?.[0] ?? null)}
          />
          <p className="text-muted-foreground text-xs">
            {proof ? proof.name : editing?.proofUrl ? t("proofRetained") : t("proofHelp")}
          </p>
        </div>
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="transaction-message">{t("message")}</Label>
          <textarea
            id="transaction-message"
            name="rawMessage"
            maxLength={5000}
            rows={2}
            defaultValue={editing?.rawMessage ?? ""}
            className="form-control"
          />
        </div>
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="transaction-notes">{t("notes")}</Label>
          <textarea
            id="transaction-notes"
            name="notes"
            maxLength={2000}
            rows={2}
            defaultValue={editing?.notes ?? ""}
            className="form-control"
          />
        </div>
        <div className="flex items-end justify-between gap-3 md:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={quickAdd}
              onChange={(event) => setQuickAdd(event.target.checked)}
            />
            {t("quickAdd")}
          </label>
          <Button
            type="submit"
            disabled={pending || !challenges.some((item) => item.status === "open")}
          >
            {duplicateConfirmed ? t("saveDuplicate") : editing ? t("update") : t("save")}
          </Button>
          {editing ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setProof(null);
                setSelectedInvestorId("");
              }}
            >
              {t("cancelEdit")}
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground flex items-center gap-1 text-xs md:col-span-2 lg:col-span-4">
          <ClipboardPaste className="size-3" /> {t("proofInputHelp")}
        </p>
      </form>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Filter by challenge"
          value={challengeFilter}
          onChange={(event) => setChallengeFilter(event.target.value)}
          className="form-control w-auto"
        >
          <option value="all">{t("allChallenges")}</option>
          {challenges.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="form-control w-auto"
        >
          <option value="all">{t("allStatuses")}</option>
          <option value="pending">{t("pending")}</option>
          <option value="verified">{t("verified")}</option>
          <option value="rejected">{t("rejected")}</option>
        </select>
        <select
          aria-label={t("investorFilter")}
          value={investorFilter}
          onChange={(event) => setInvestorFilter(event.target.value)}
          className="form-control w-auto"
        >
          <option value="all">{t("allInvestors")}</option>
          {investors.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t("typeFilter")}
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="form-control w-auto"
        >
          <option value="all">{t("allTypes")}</option>
          <option value="UNITS">{t("units")}</option>
          <option value="STOCK_MARKET">{t("stock")}</option>
        </select>
        <Input
          type="date"
          aria-label={t("fromDate")}
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        <Input
          type="date"
          aria-label={t("toDate")}
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
        <a
          className="text-primary ml-auto self-center text-sm underline"
          href={`/api/reports?${exportParams.toString()}`}
        >
          {t("export")}
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-3 py-3 text-left">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-3 tabular-nums">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {!table.getRowModel().rows.length ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-muted-foreground px-4 py-8 text-center"
                >
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
