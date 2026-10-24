import type { Challenge, ChallengeSummary, Investor, Transaction } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type InvestorRow = {
  id: string;
  name: string;
  name_lower: string;
  phone: string | null;
  notes: string | null;
  status: Investor["status"];
  portal_uid: string | null;
  created_at: string;
  updated_at: string;
};
type ChallengeRow = {
  id: string;
  title: string;
  month: number;
  year: number;
  start_date: string;
  end_date: string;
  status: Challenge["status"];
  created_at: string;
  updated_at: string;
};
type TransactionRow = {
  id: string;
  challenge_id: string;
  investor_id: string;
  investor_name: string;
  type: Transaction["type"];
  amount: number | string;
  date: string;
  institution: string | null;
  reference: string | null;
  proof_url: string | null;
  proof_path: string | null;
  raw_message: string | null;
  notes: string | null;
  status: Transaction["status"];
  source: Transaction["source"];
  created_by: string;
  created_at: string;
  updated_at: string;
  verified_by: string | null;
  verified_at: string | null;
};

export function mapInvestor(row: InvestorRow): Investor {
  return {
    id: row.id,
    name: row.name,
    nameLower: row.name_lower,
    phone: row.phone ?? "",
    notes: row.notes ?? "",
    status: row.status,
    portalUid: row.portal_uid ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    title: row.title,
    month: row.month,
    year: row.year,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    totals: { units: 0, stock: 0, final: 0, participants: 0 },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapChallengeSummary(row: ChallengeRow): ChallengeSummary {
  const challenge = mapChallenge(row);
  return {
    id: challenge.id,
    title: challenge.title,
    month: challenge.month,
    year: challenge.year,
    startDate: challenge.startDate,
    endDate: challenge.endDate,
    status: challenge.status,
  };
}

export function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    challengeId: row.challenge_id,
    investorId: row.investor_id,
    investorName: row.investor_name,
    type: row.type,
    amount: Number(row.amount),
    date: row.date,
    institution: row.institution ?? "",
    reference: row.reference ?? "",
    proofUrl: row.proof_url ?? "",
    proofPath: row.proof_path ?? "",
    rawMessage: row.raw_message ?? "",
    notes: row.notes ?? "",
    status: row.status,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedBy: row.verified_by ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
  };
}

export async function signedProofUrl(supabase: SupabaseClient, path: string): Promise<string> {
  if (!path) return "";
  const { data, error } = await supabase.storage.from("proofs").createSignedUrl(path, 60 * 30);
  return error ? "" : data.signedUrl;
}

export async function withSignedProofUrls(
  supabase: SupabaseClient,
  rows: Transaction[],
): Promise<Transaction[]> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      proofUrl: await signedProofUrl(supabase, row.proofPath ?? ""),
    })),
  );
}
