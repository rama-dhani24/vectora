export const USER_ROLES = ["super_admin", "admin", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Mirror of the custom claim, stored at users/{uid}. Written only by trusted server code. */
export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The minimal, verified identity passed from the server to the UI. */
export interface SessionUser {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
}

export type InvestorStatus = "active" | "inactive";

export interface Investor {
  id: string;
  name: string;
  nameLower: string;
  phone?: string;
  notes?: string;
  status: InvestorStatus;
  /** Reserved for the future investor portal: the Firebase Auth uid linked to this investor. */
  portalUid?: string;
  createdAt: string;
  updatedAt: string;
}

export type ChallengeStatus = "draft" | "open" | "closed";

/** All money values are whole TZS stored as integers. */
export interface ChallengeTotals {
  units: number;
  stock: number;
  final: number;
  participants: number;
}

export interface Challenge {
  id: string;
  title: string;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  status: ChallengeStatus;
  totals: ChallengeTotals;
  createdAt: string;
  updatedAt: string;
}

export const INVESTMENT_TYPES = ["UNITS", "STOCK_MARKET"] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

export type TransactionStatus = "pending" | "verified" | "rejected";
export type TransactionSource = "manual" | "import";

export interface Transaction {
  id: string;
  challengeId: string;
  investorId: string;
  investorName: string;
  type: InvestmentType;
  amount: number;
  date: string;
  institution?: string;
  reference?: string;
  proofUrl?: string;
  proofPath?: string;
  rawMessage?: string;
  notes?: string;
  status: TransactionStatus;
  source: TransactionSource;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface InvestorChallengeTotal {
  investorId: string;
  investorName: string;
  units: number;
  stock: number;
  total: number;
  firstTransactionAt?: string;
}

export type AuditEntity = "user" | "investor" | "challenge" | "transaction";

export interface AuditLog {
  id: string;
  entity: AuditEntity;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  userId: string;
  timestamp: string;
}
