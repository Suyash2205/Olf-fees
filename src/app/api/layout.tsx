/** Portal APIs must always read live sheet data, not a cached snapshot. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ApiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
