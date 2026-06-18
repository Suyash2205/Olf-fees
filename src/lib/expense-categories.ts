/** Default expense categories (from school list; excludes fee income types). */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Bus Expense",
  "Salary",
  "School Maintenance",
  "Books Vendor",
  "Uniform Vendor",
  "Stationary",
  "School Activities",
  "Reference Money",
  "Rent",
  "Sharing",
] as const;

export function normalizeCategoryName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.toLowerCase() === "school maitenance") return "School Maintenance";
  return trimmed;
}

export function isValidCategoryName(name: string): boolean {
  return normalizeCategoryName(name).length >= 2;
}
