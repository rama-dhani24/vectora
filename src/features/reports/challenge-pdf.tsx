import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvestorAggregate } from "@/lib/domain/aggregation";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: "#172033", fontFamily: "Helvetica" },
  title: { fontSize: 15, fontWeight: 700, marginBottom: 5 },
  subtitle: { fontSize: 9, color: "#64748b", marginBottom: 18 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e2e8f0", paddingVertical: 6 },
  header: { backgroundColor: "#f1f5f9", fontWeight: 700 },
  cellNo: { width: "7%" },
  cellName: { width: "35%" },
  cellAmount: { width: "19%", textAlign: "right" },
  total: { fontWeight: 700, backgroundColor: "#f8fafc" },
});

export function ChallengePdfPage({
  title,
  rows,
  totals,
  includePending,
}: {
  title: string;
  rows: InvestorAggregate[];
  totals: { units: number; stock: number; final: number };
  includePending: boolean;
}) {
  const money = (value: number) => `TZS ${new Intl.NumberFormat("en-US").format(value)}`;
  return (
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          Amounts in TZS · {includePending ? "verified and pending" : "verified transactions only"}
        </Text>
        <View style={[styles.row, styles.header]}>
          <Text style={styles.cellNo}>No</Text>
          <Text style={styles.cellName}>Investor Name</Text>
          <Text style={styles.cellAmount}>Units</Text>
          <Text style={styles.cellAmount}>Stock Market</Text>
          <Text style={styles.cellAmount}>Total</Text>
        </View>
        {rows.map((row, index) => (
          <View key={row.investorId} style={styles.row}>
            <Text style={styles.cellNo}>{index + 1}</Text>
            <Text style={styles.cellName}>{row.investorName}</Text>
            <Text style={styles.cellAmount}>{money(row.units)}</Text>
            <Text style={styles.cellAmount}>{money(row.stock)}</Text>
            <Text style={styles.cellAmount}>{money(row.total)}</Text>
          </View>
        ))}
        <View style={[styles.row, styles.total]}>
          <Text style={styles.cellNo} />
          <Text style={styles.cellName}>TOTAL</Text>
          <Text style={styles.cellAmount}>{money(totals.units)}</Text>
          <Text style={styles.cellAmount}>{money(totals.stock)}</Text>
          <Text style={styles.cellAmount}>{money(totals.final)}</Text>
        </View>
        <View style={[styles.row, styles.total]}>
          <Text style={styles.cellNo} />
          <Text style={styles.cellName}>FINAL TOTAL</Text>
          <Text style={styles.cellAmount} />
          <Text style={styles.cellAmount} />
          <Text style={styles.cellAmount}>{money(totals.final)}</Text>
        </View>
      </Page>
  );
}
