import { describe, expect, it } from "vitest";
import writeExcelFile, { type Sheet } from "write-excel-file/universal";

import { renderStatement } from "@/lib/jobs/render-sql";
import { parseWorkbook } from "@/lib/workbook/parse";

const PULL_HEADER = [
  "Got",
  "Source box",
  "Shelf / freezer",
  "Source position",
  "Original ID",
  "Put in slot",
  "New ID",
  "Volume note",
  "Aliquoted",
  "Returned",
];

type Row = [
  box: string,
  shelf: string,
  pos: string,
  orig: number,
  slot: string,
  id: string,
  note?: string,
];

/** A workbook laid out like the lab's: an overview, then grid and pull sheets per batch. */
async function makeWorkbook(options: {
  pulls: Record<string, Row[]>;
  overview?: boolean;
}): Promise<ArrayBuffer> {
  const sheets: Sheet<Blob>[] = [];
  if (options.overview ?? true) {
    sheets.push({
      sheet: "Overview",
      data: [
        ["Aliquot batches"],
        [],
        ["Batch", "New IDs", "Samples", "Boxes to fill"],
        [1, "S0001 - S0002", 2, "Ship 1, Keep2 1, Keep3 1"],
        [2, "S0003 - S0003", 1, "Ship 7, Keep2 7, Keep3 7"],
      ],
    });
  }
  for (const [name, rows] of Object.entries(options.pulls)) {
    sheets.push({
      sheet: name.replace("pull", "grid"),
      data: [["1) TUBE LABELS (new ID)"]],
    });
    sheets.push({
      sheet: name,
      data: [
        ["Batch pull list"],
        [],
        PULL_HEADER,
        ...rows.map((r) => [
          null,
          r[0],
          r[1],
          r[2],
          r[3],
          r[4],
          r[5],
          r[6] ?? null,
        ]),
      ],
    });
  }
  return (await writeExcelFile(sheets).toBlob()).arrayBuffer();
}

describe("workbook parser", () => {
  it("reads pull sheets in row order, with overview box numbers and set names", async () => {
    const data = await makeWorkbook({
      pulls: {
        B01_pull: [
          ["case_box 1", "case box", "1-C-10", 41540, "B1", "S0002", "Low"],
          ["NIP Box 8", "2nd shelf", "8-E-8", 51009, "A1", "s0001"],
        ],
        B02_pull: [["AIP Box 4", "5th shelf", "4-B-15", 50760, "A1", "S0003"]],
      },
    });
    const r = await parseWorkbook(data);
    expect(r.errors).toEqual([]);
    expect(r.workbook?.destSets).toEqual(["Ship", "Keep2", "Keep3"]);
    expect(r.workbook?.batches.map((b) => [b.number, b.boxNumber])).toEqual([
      [1, 1],
      [2, 7],
    ]);
    expect(r.workbook?.batches[0]?.samples).toEqual([
      {
        pullOrder: 1,
        newId: "S0002",
        originalId: "41540",
        sourceBox: "case_box 1",
        sourceLocation: "case box",
        sourcePosition: "1-C-10",
        slot: "B1",
        volumeNote: "Low",
      },
      expect.objectContaining({
        pullOrder: 2,
        newId: "S0001",
        volumeNote: null,
      }),
    ]);
  });

  it("falls back to default set names and batch-numbered boxes without an overview", async () => {
    const data = await makeWorkbook({
      overview: false,
      pulls: { B03_pull: [["c", "s", "1-A-1", 1, "A1", "S0001"]] },
    });
    const r = await parseWorkbook(data);
    expect(r.workbook?.destSets).toEqual(["Ship", "Keep2", "Keep3"]);
    expect(r.workbook?.batches[0]?.boxNumber).toBe(3);
    expect(r.warnings.join(" ")).toMatch(/Boxes to fill/);
  });

  it("refuses duplicate new IDs and slots", async () => {
    const data = await makeWorkbook({
      pulls: {
        B01_pull: [
          ["c", "s", "1-A-1", 1, "A1", "S0001"],
          ["c", "s", "1-A-2", 2, "A1", "S0002"],
        ],
        B02_pull: [["c", "s", "1-A-3", 3, "A1", "S0001"]],
      },
    });
    const r = await parseWorkbook(data);
    expect(r.workbook).toBeNull();
    expect(r.errors).toEqual(
      expect.arrayContaining([
        "Batch 1: slot A1 is used twice.",
        "New ID S0001 appears twice (batch 1 and batch 2).",
      ]),
    );
  });

  it("reports rows with missing required cells", async () => {
    const data = await makeWorkbook({
      pulls: { B01_pull: [["c", "s", "1-A-1", 1, "", "S0001"]] },
    });
    const r = await parseWorkbook(data);
    expect(r.errors).toEqual(['Sheet "B01_pull" row 4: missing slot.']);
  });

  it("explains a file that is not a workbook", async () => {
    const r = await parseWorkbook(
      new TextEncoder().encode("not a zip").buffer as ArrayBuffer,
    );
    expect(r.errors[0]).toMatch(/not a readable/);
  });
});

describe("seed SQL rendering", () => {
  it("inlines values as escaped literals", () => {
    expect(
      renderStatement("insert into t values ($1, $2, $3, $10)", [
        "O'Brien",
        null,
        { a: "x" },
        ...Array(6).fill(0),
        7,
      ]),
    ).toBe(`insert into t values ('O''Brien', NULL, '{"a":"x"}', 7)`);
  });
});
