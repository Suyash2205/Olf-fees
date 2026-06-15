/** Map other-fee types to expense categories for income vs expense comparison. */
export interface FeeExpensePair {
  id: string;
  label: string;
  feeTypes: string[];
  expenseCategories: string[];
}

export const FEE_EXPENSE_PAIRS: FeeExpensePair[] = [
  {
    id: "bus",
    label: "Bus",
    feeTypes: ["Bus"],
    expenseCategories: ["Bus Expense"],
  },
  {
    id: "books",
    label: "Books",
    feeTypes: ["Books"],
    expenseCategories: ["Books Vendor"],
  },
  {
    id: "bag",
    label: "Bag / Uniform",
    feeTypes: ["Bag"],
    expenseCategories: ["Uniform Vendor"],
  },
  {
    id: "stationary",
    label: "Stationary",
    feeTypes: ["Stationary"],
    expenseCategories: ["Stationary"],
  },
];

export function normalizeMatchKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function feeTypeMatches(pair: FeeExpensePair, feeType: string): boolean {
  const key = normalizeMatchKey(feeType);
  return pair.feeTypes.some((t) => normalizeMatchKey(t) === key);
}

export function expenseCategoryMatches(pair: FeeExpensePair, category: string): boolean {
  const key = normalizeMatchKey(category);
  return pair.expenseCategories.some((c) => normalizeMatchKey(c) === key);
}
