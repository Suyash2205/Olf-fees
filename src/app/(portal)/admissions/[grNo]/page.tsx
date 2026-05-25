import AdmissionProfile from "../AdmissionProfile";

export default async function AdmissionDetailPage({
  params,
}: {
  params: Promise<{ grNo: string }>;
}) {
  const { grNo } = await params;
  return <AdmissionProfile grNo={grNo} />;
}
