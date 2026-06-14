import UdiseList from "./UdiseList";

export default function UdisePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">UDISE</h1>
        <p className="text-sm text-slate-500 mt-1">
          Student details from UDISE export · synced to the{" "}
          <strong>UDISE</strong> tab on the fees spreadsheet
        </p>
      </div>
      <UdiseList />
    </div>
  );
}
