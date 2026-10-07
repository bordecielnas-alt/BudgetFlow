import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BudgetFlow — suivi de budget auto-hébergé" },
      {
        name: "description",
        content:
          "BudgetFlow : dashboard, table éditable et import de relevés PDF par IA pour piloter vos dépenses et recettes.",
      },
      { property: "og:title", content: "BudgetFlow — suivi de budget auto-hébergé" },
      {
        property: "og:description",
        content: "Dashboard interactif, table éditable et import de relevés par IA.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
