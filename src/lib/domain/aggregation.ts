import type { InvestmentType, Transaction } from "@/types";

export interface InvestorAggregate {
  investorId: string;
  investorName: string;
  units: number;
  stock: number;
  total: number;
  firstTransactionAt: string;
}

export interface ChallengeAggregate {
  units: number;
  stock: number;
  final: number;
  participants: number;
}

export function aggregateTransactions(
  transactions: readonly Pick<
    Transaction,
    "investorId" | "investorName" | "type" | "amount" | "date" | "status"
  >[],
  includePending = false,
): { investors: InvestorAggregate[]; totals: ChallengeAggregate } {
  const map = new Map<string, InvestorAggregate>();
  let units = 0;
  let stock = 0;

  for (const transaction of transactions) {
    if (
      transaction.status !== "verified" &&
      !(includePending && transaction.status === "pending")
    ) {
      continue;
    }
    if (!Number.isSafeInteger(transaction.amount) || transaction.amount <= 0) {
      throw new RangeError(`Invalid transaction amount: ${transaction.amount}`);
    }

    const row = map.get(transaction.investorId) ?? {
      investorId: transaction.investorId,
      investorName: transaction.investorName,
      units: 0,
      stock: 0,
      total: 0,
      firstTransactionAt: transaction.date,
    };
    row.investorName = transaction.investorName;
    row.firstTransactionAt =
      transaction.date < row.firstTransactionAt ? transaction.date : row.firstTransactionAt;
    if (transaction.type === ("UNITS" satisfies InvestmentType)) {
      row.units += transaction.amount;
      units += transaction.amount;
    } else {
      row.stock += transaction.amount;
      stock += transaction.amount;
    }
    row.total = row.units + row.stock;
    if (![row.units, row.stock, row.total, units, stock].every(Number.isSafeInteger)) {
      throw new RangeError("Aggregate exceeds the safe integer range");
    }
    map.set(transaction.investorId, row);
  }

  const investors = [...map.values()].sort((a, b) => {
    const byDate = a.firstTransactionAt.localeCompare(b.firstTransactionAt);
    return byDate || a.investorName.localeCompare(b.investorName);
  });
  const final = units + stock;
  if (!Number.isSafeInteger(final)) {
    throw new RangeError("Aggregate exceeds the safe integer range");
  }
  return {
    investors,
    totals: { units, stock, final, participants: investors.length },
  };
}

export interface Reconciliation {
  actualUnits: number;
  actualStock: number;
  actualFinal: number;
  expectedUnits: number;
  expectedStock: number;
  expectedFinal: number;
  matches: boolean;
}

export function reconcileTotals(
  rows: readonly { units: number; stock: number }[],
  expected: { units: number; stock: number; final: number },
): Reconciliation {
  if (
    ![expected.units, expected.stock, expected.final].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    rows.some(
      (row) =>
        !Number.isSafeInteger(row.units) ||
        row.units < 0 ||
        !Number.isSafeInteger(row.stock) ||
        row.stock < 0,
    )
  ) {
    throw new RangeError("Reconciliation values must be non-negative whole TZS amounts.");
  }
  const actualUnits = rows.reduce((total, row) => total + row.units, 0);
  const actualStock = rows.reduce((total, row) => total + row.stock, 0);
  const actualFinal = actualUnits + actualStock;
  if (![actualUnits, actualStock, actualFinal].every(Number.isSafeInteger)) {
    throw new RangeError("Import totals exceed the safe integer range");
  }
  return {
    actualUnits,
    actualStock,
    actualFinal,
    expectedUnits: expected.units,
    expectedStock: expected.stock,
    expectedFinal: expected.final,
    matches:
      actualUnits === expected.units &&
      actualStock === expected.stock &&
      actualFinal === expected.final,
  };
}
