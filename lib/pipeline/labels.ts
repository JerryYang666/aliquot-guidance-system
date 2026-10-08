/** Tube labels are "<new ID>-<n>", e.g. "S0066-2"; the Data Matrix holds exactly that text. */

export interface ParsedLabel {
  newId: string;
  tube: number;
}

export function labelFor(newId: string, tube: number): string {
  return `${newId}-${tube}`;
}

/** Uppercases and drops whitespace and control characters a scanner may add. */
export function normalizeLabel(raw: string): string {
  return raw.replace(/[\s\u0000-\u001f\u007f]/g, "").toUpperCase();
}

export function parseLabel(raw: string): ParsedLabel | null {
  const match = /^(.+)-(\d{1,2})$/.exec(normalizeLabel(raw));
  if (!match?.[1] || !match[2]) return null;
  const tube = Number(match[2]);
  if (tube < 1) return null;
  return { newId: match[1], tube };
}
