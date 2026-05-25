import EditAdmissionClient from "./EditAdmissionClient";

export default async function EditAdmissionPage({
  params,
}: {
  params: Promise<{ grNo: string }>;
}) {
  const { grNo } = await params;
  return <EditAdmissionClient grNo={decodeURIComponent(grNo)} />;
}
