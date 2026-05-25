/** Matches Fee details naming: FirstName FatherName Surname */
export function buildFullName(parts: {
  surname: string;
  firstName: string;
  fatherName?: string;
}): string {
  return [parts.firstName, parts.fatherName, parts.surname]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
}

export function normalizeStudentName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
