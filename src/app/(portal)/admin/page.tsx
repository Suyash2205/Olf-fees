import AdminAdmissionBackfill from "@/components/admin/AdminAdmissionBackfill";
import AdminAuditLog from "@/components/admin/AdminAuditLog";
import AdminGate from "@/components/admin/AdminGate";
import AdminIndividualPromotion from "@/components/admin/AdminIndividualPromotion";
import AdminStudentManagement from "@/components/admin/AdminStudentManagement";
import PromotionPanel from "../students/PromotionPanel";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Admin</h1>
        <p className="text-sm text-slate-500 mt-1">
          Password-protected area for promotion, activity logs, and sensitive student changes.
        </p>
      </div>
      <AdminGate>
        <div className="space-y-6">
          <AdminAuditLog />
          <AdminAdmissionBackfill />
          <PromotionPanel />
          <AdminIndividualPromotion />
          <AdminStudentManagement />
        </div>
      </AdminGate>
    </div>
  );
}
