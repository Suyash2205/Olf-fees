export interface UdiseRecord {
  className: string;
  section: string;
  name: string;
  gender: string;
  permanentEducationNumber: string;
  studentStateCode: string;
  fatherName: string;
  motherName: string;
  socialCategory: string;
  minorityGroup: string;
  bplBeneficiary: string;
  cwsn: string;
  typeOfImpairments: string;
  isRepeater: string;
  suspectedDuplicate: string;
  entryStatus: string;
  aadhaarNumber: string;
  nameAsPerAadhaar: string;
  aadhaarValidationStatus: string;
  grNumber: string;
  heightCm: string;
  weightKg: string;
  sheetRow: number;
}

export function udiseRowKey(r: UdiseRecord): string {
  return r.permanentEducationNumber || `${r.name}|${r.className}|${r.section}`;
}

export function udiseDetailFields(
  r: UdiseRecord
): { label: string; value: string }[] {
  return [
    { label: "Class", value: r.className },
    { label: "Section", value: r.section },
    { label: "Name", value: r.name },
    { label: "Gender", value: r.gender },
    { label: "Permanent Education Number", value: r.permanentEducationNumber },
    { label: "Student State Code", value: r.studentStateCode },
    { label: "Father Name", value: r.fatherName },
    { label: "Mother Name", value: r.motherName },
    { label: "Social Category", value: r.socialCategory },
    { label: "Minority Group", value: r.minorityGroup },
    { label: "BPL beneficiary", value: r.bplBeneficiary },
    { label: "CWSN", value: r.cwsn },
    { label: "Type of Impairments", value: r.typeOfImpairments },
    { label: "Is Repeater", value: r.isRepeater },
    { label: "Suspected Duplicate", value: r.suspectedDuplicate },
    { label: "Entry Status", value: r.entryStatus },
    { label: "AADHAAR Number of Student", value: r.aadhaarNumber },
    { label: "Name As per AADHAAR", value: r.nameAsPerAadhaar },
    { label: "AADHAAR Validation Status", value: r.aadhaarValidationStatus },
    { label: "Admission Number (GR Number)", value: r.grNumber },
    { label: "Height (CMs)", value: r.heightCm },
    { label: "Weight (KGs)", value: r.weightKg },
  ];
}
