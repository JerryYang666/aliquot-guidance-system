import readExcelFile from "read-excel-file/universal";

import {
  checkWorkbook,
  DEFAULT_DEST_SETS,
  normalizeWorkbook,
  type ParsedBatch,
  type ParsedSample,
  type ParsedWorkbook,
} from "./model";

export interface ParseResult {
  workbook: ParsedWorkbook | null;
  errors: string[];
  warnings: string[];
}

type Field = keyof Omit<ParsedSample, "pullOrder">;

/** Header text → field. Matched case-insensitively after collapsing spaces. */
const HEADERS: Record<Field, string[]> = {
  sourceBox: ["source box"],
  sourceLocation: [
    "shelf / freezer",
    "shelf/freezer",
    "shelf",
    "freezer",
    "location",
  ],
  sourcePosition: ["source position", "position"],
  originalId: ["original id"],
  slot: ["put in slot", "slot"],
  newId: ["new id"],
  volumeNote: ["volume note", "volume", "note"],
};
const REQUIRED: Field[] = ["sourceBox", "originalId", "slot", "newId"];

/** One worksheet as rows of cells, laid out as in the file (blank rows kept). */
interface Sheet {
  name: string;
  rows: readonly (readonly unknown[])[];
}

/** Plain text of a cell (strings, numbers, booleans, dates; formulas arrive as their result). */
export function cellText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return "";
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A row's cell texts, indexed from 1 like spreadsheet columns (A = 1). */
function rowTexts(sheet: Sheet, rowNumber: number): string[] {
  const row = sheet.rows[rowNumber - 1] ?? [];
  const texts: string[] = [];
  for (let c = 1; c <= row.length; c++) texts[c] = cellText(row[c - 1]);
  return texts;
}

/** Finds the header row of a pull list: one naming both "New ID" and "Original ID". */
function findHeader(
  sheet: Sheet,
): { row: number; columns: Partial<Record<Field, number>> } | null {
  for (let r = 1; r <= Math.min(sheet.rows.length, 15); r++) {
    const texts = rowTexts(sheet, r).map((t) => (t ? norm(t) : ""));
    if (!texts.includes("new id") || !texts.includes("original id")) continue;
    const columns: Partial<Record<Field, number>> = {};
    for (const [field, names] of Object.entries(HEADERS) as [
      Field,
      string[],
    ][]) {
      for (const name of names) {
        const c = texts.indexOf(name);
        if (c > 0 && !Object.values(columns).includes(c)) {
          columns[field] = c;
          break;
        }
      }
    }
    return { row: r, columns };
  }
  return null;
}

function batchNumberOf(sheet: Sheet): number | null {
  const fromName = /^b(?:atch)?\s*0*(\d+)/i.exec(sheet.name.trim());
  if (fromName?.[1]) return Number(fromName[1]);
  const title = cellText(sheet.rows[0]?.[0]);
  const fromTitle = /batch\s*0*(\d+)/i.exec(title);
  return fromTitle?.[1] ? Number(fromTitle[1]) : null;
}

/**
 * Reads the overview's "Boxes to fill" column ("Ship 1, Keep2 1, Keep3 1"):
 * the destination set names and each batch's box number.
 */
function readOverview(sheets: Sheet[]): {
  destSets: string[] | null;
  boxNumbers: Map<number, number>;
} {
  const boxNumbers = new Map<number, number>();
  let destSets: string[] | null = null;
  for (const sheet of sheets) {
    for (let r = 1; r <= Math.min(sheet.rows.length, 15); r++) {
      const texts = rowTexts(sheet, r).map((t) => (t ? norm(t) : ""));
      const batchCol = texts.indexOf("batch");
      const boxesCol = texts.indexOf("boxes to fill");
      if (batchCol < 1 || boxesCol < 1) continue;
      for (let rr = r + 1; rr <= sheet.rows.length; rr++) {
        const row = rowTexts(sheet, rr);
        const batch = Number(row[batchCol]);
        const boxes = (row[boxesCol] ?? "")
          .split(",")
          .map((p) => /^(.*\S)\s+(\d+)$/.exec(p.trim()));
        if (!Number.isInteger(batch) || batch < 1 || boxes.some((m) => !m))
          continue;
        const names = boxes.map((m) => m![1]!);
        const numbers = new Set(boxes.map((m) => Number(m![2])));
        if (numbers.size === 1) boxNumbers.set(batch, [...numbers][0]!);
        destSets ??= names;
      }
      return { destSets, boxNumbers };
    }
  }
  return { destSets, boxNumbers };
}

export async function parseWorkbook(data: ArrayBuffer): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sheets: Sheet[];
  try {
    sheets = (await readExcelFile(data)).map((s) => ({
      name: s.sheet,
      rows: s.data,
    }));
  } catch {
    return {
      workbook: null,
      errors: ["This file is not a readable .xlsx workbook."],
      warnings,
    };
  }

  const overview = readOverview(sheets);
  const batches: ParsedBatch[] = [];

  for (const sheet of sheets) {
    const header = findHeader(sheet);
    if (!header) continue;
    const missing = REQUIRED.filter((f) => !header.columns[f]);
    if (missing.length) {
      errors.push(
        `Sheet "${sheet.name}": no column for ${missing.join(", ")}.`,
      );
      continue;
    }
    const number = batchNumberOf(sheet);
    if (number === null) {
      errors.push(
        `Sheet "${sheet.name}": cannot tell which batch it is (name it like "B01_pull").`,
      );
      continue;
    }

    const samples: ParsedSample[] = [];
    for (let r = header.row + 1; r <= sheet.rows.length; r++) {
      const texts = rowTexts(sheet, r);
      const get = (f: Field) => {
        const c = header.columns[f];
        return c ? (texts[c] ?? "") : "";
      };
      if (REQUIRED.every((f) => !get(f))) continue;
      const absent = REQUIRED.filter((f) => !get(f));
      if (absent.length) {
        errors.push(
          `Sheet "${sheet.name}" row ${r}: missing ${absent.join(", ")}.`,
        );
        continue;
      }
      samples.push({
        pullOrder: samples.length + 1,
        newId: get("newId"),
        originalId: get("originalId"),
        sourceBox: get("sourceBox"),
        sourceLocation: get("sourceLocation") || null,
        sourcePosition: get("sourcePosition") || null,
        slot: get("slot"),
        volumeNote: get("volumeNote") || null,
      });
    }
    if (!samples.length) {
      warnings.push(
        `Sheet "${sheet.name}" has a pull-list header but no rows; skipped.`,
      );
      continue;
    }
    const boxNumber = overview.boxNumbers.get(number);
    if (boxNumber === undefined && overview.boxNumbers.size) {
      warnings.push(
        `Batch ${number} is not in the overview; its boxes are numbered ${number}.`,
      );
    }
    batches.push({ number, boxNumber: boxNumber ?? number, samples });
  }

  if (!batches.length && !errors.length) {
    errors.push(
      'No pull-list sheet found (a sheet with "New ID" and "Original ID" columns).',
    );
  }
  if (errors.length) return { workbook: null, errors, warnings };

  if (!overview.destSets) {
    warnings.push(
      `No "Boxes to fill" overview found; using ${DEFAULT_DEST_SETS.join(", ")}.`,
    );
  }
  const parsed = normalizeWorkbook({
    destSets: overview.destSets ?? DEFAULT_DEST_SETS,
    batches: batches.sort((a, b) => a.number - b.number),
  });
  const check = checkWorkbook(parsed);
  return {
    workbook: check.errors.length ? null : parsed,
    errors: check.errors,
    warnings: [...warnings, ...check.warnings],
  };
}
