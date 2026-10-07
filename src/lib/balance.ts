// Contrôle de cohérence d'un relevé, partagé serveur / écran de relecture.
import type { BalanceCheck, StatementInfo } from "@/lib/budget-types";

const euros = (value: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);

/** Compare la somme des opérations extraites aux soldes / totaux imprimés sur le relevé. */
export function checkBalance(
  statement: StatementInfo,
  candidates: Array<{ amount: number }>,
): BalanceCheck {
  const sum = candidates.reduce((total, row) => total + row.amount, 0);
  const debit = candidates
    .filter((row) => row.amount < 0)
    .reduce((total, row) => total - row.amount, 0);
  const credit = candidates
    .filter((row) => row.amount > 0)
    .reduce((total, row) => total + row.amount, 0);
  const close = (a: number, b: number) => Math.abs(a - b) < 0.005;

  const { opening_balance: opening, closing_balance: closing } = statement;
  if (opening !== null && closing !== null) {
    const expected = closing - opening;
    if (close(sum, expected)) {
      return {
        status: "ok",
        message: `Soldes vérifiés : ${euros(opening)} + ${euros(sum)} = ${euros(closing)}.`,
      };
    }
    return {
      status: "mismatch",
      message: `Écart de ${euros(sum - expected)} : le relevé passe de ${euros(opening)} à ${euros(closing)} (${euros(expected)}), les opérations extraites totalisent ${euros(sum)}. Une ligne manque ou un montant est faux.`,
    };
  }

  const { total_debit: totalDebit, total_credit: totalCredit } = statement;
  if (totalDebit !== null || totalCredit !== null) {
    const debitOk = totalDebit === null || close(debit, Math.abs(totalDebit));
    const creditOk = totalCredit === null || close(credit, Math.abs(totalCredit));
    if (debitOk && creditOk) {
      return { status: "ok", message: "Totaux des débits et crédits vérifiés." };
    }
    return {
      status: "mismatch",
      message: `Totaux différents du relevé — débits : ${euros(debit)} extraits${totalDebit !== null ? ` / ${euros(Math.abs(totalDebit))} imprimés` : ""}, crédits : ${euros(credit)} extraits${totalCredit !== null ? ` / ${euros(Math.abs(totalCredit))} imprimés` : ""}.`,
    };
  }

  return {
    status: "unavailable",
    message: "Pas de solde ni de total sur le document : vérifiez les lignes manuellement.",
  };
}
