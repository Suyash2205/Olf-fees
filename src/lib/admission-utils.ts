export function buildFullName(parts: {
  surname: string;
  firstName: string;
  fatherName?: string;
}): string {
  return [parts.surname, parts.firstName, parts.fatherName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
}
