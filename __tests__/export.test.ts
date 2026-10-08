import readExcelFile from "read-excel-file/universal";
import { describe, expect, it } from "vitest";

import type { LogEvent } from "@/lib/pipeline/types";
import { renderWorkbook } from "@/lib/server/export";

import { makeSample, T0, T1 } from "./helpers";

describe("Excel export", () => {
  it("writes one sheet per batch with every step, then the event log", async () => {
    const done = makeSample({
      batchNumber: 1,
      pullOrder: 1,
      newId: "S0066",
      originalId: "41540",
      slot: "G6",
      volumeNote: "Low",
      pulledAt: T0,
      pulledBy: "Pat",
      labeledAt: T0,
      labeledBy: "Lee",
      finishedAt: T1,
      finishedBy: "Ali",
      tubes: [
        { status: "placed", at: T1, by: "Ali" },
        { status: "placed", at: T1, by: "Ali" },
        { status: "not_filled", at: T1, by: "Ali" },
      ],
      notes: [{ at: T1, by: "Ali", text: "Only 200 µL" }],
    });
    const waiting = makeSample({
      batchNumber: 2,
      pullOrder: 1,
      newId: "S0101",
    });
    const event: LogEvent = {
      id: 7,
      version: 3,
      at: T1,
      clientAt: T0,
      actorName: "Ali",
      actorRole: "aliquoter",
      type: "tube_placed",
      batchNumber: 1,
      sampleId: done.id,
      newId: "S0066",
      tube: 2,
      data: { set: "Keep2", box: 1, slot: "G6" },
    };

    const file = await renderWorkbook({
      destSets: ["Ship", "Keep2", "Keep3"],
      batchNumbers: [1, 2],
      samples: [done, waiting],
      events: [event],
    });
    const sheets = await readExcelFile(file);

    expect(sheets.map((s) => s.sheet)).toEqual([
      "Batch 1",
      "Batch 2",
      "Event log",
    ]);
    const [header, row] = sheets[0]!.data;
    const cells = Object.fromEntries(header!.map((h, i) => [h, row![i]]));
    expect(cells).toMatchObject({
      "New ID": "S0066",
      "Original ID": "41540",
      Slot: "G6",
      "Volume note": "Low",
      "Pulled by": "Pat",
      "Labeled by": "Lee",
      "Ship (-1)": "placed",
      "Keep3 (-3)": "not_filled",
      "Keep3 by": "Ali",
      "Finished at": T1,
      Notes: "Ali: Only 200 µL",
    });
    expect(sheets[1]!.data).toHaveLength(2);
    expect(sheets[2]!.data[1]).toEqual([
      7,
      T1,
      T0,
      "Ali",
      "aliquoter",
      "tube_placed",
      1,
      "S0066",
      "S0066-2",
      JSON.stringify(event.data),
    ]);
  });
});
