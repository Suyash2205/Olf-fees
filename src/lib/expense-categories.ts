/** Default expense categories (from school list; excludes fee income types). */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Bus Expense",
  "Salary",
  "School Maitenance",
  "Books Vendor",
  "Uniform Vendor",
  "Stationary",
  "School Activities",
  "Reference Money",
  "Rent",
  "Sharing",
] as const;

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isValidCategoryName(name: string): boolean {
  return normalizeCategoryName(name).length >= 2;
}
