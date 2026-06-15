import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ type?: string }>;
};

export default async function OtherFeesPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.type ? `?type=${encodeURIComponent(params.type)}` : "";
  redirect(`/daily-entry${q}`);
}
