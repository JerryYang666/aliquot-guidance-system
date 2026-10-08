/**
 * Box geometry, derived from the positions a job actually uses. The lab's
 * boxes skip row I (A–H, J, K), so I is left out unless a position uses it.
 */
export interface BoxLayout {
  rows: string[];
  cols: number;
}

export interface JobLayouts {
  /** The destination boxes (every set shares one layout). */
  dest: BoxLayout;
  /** Source boxes by kind ("case_box", "AIP Box", ...). */
  sources: Record<string, BoxLayout>;
}

/** "case_box 1" → "case_box"; "AIP Box 14" → "AIP Box". */
export function boxKind(sourceBox: string): string {
  return sourceBox.replace(/\s*\d+$/, "") || sourceBox;
}

/** A source position "1-C-10" → row C, column 10. */
export function parsePosition(
  position: string | null,
): { row: string; col: number } | null {
  const match = /^\s*\d+\s*-\s*([A-Za-z])\s*-\s*(\d+)\s*$/.exec(position ?? "");
  return match?.[1] && match[2]
    ? { row: match[1].toUpperCase(), col: Number(match[2]) }
    : null;
}

/** A slot "G6" → row G, column 6. */
export function parseSlot(slot: string): { row: string; col: number } | null {
  const match = /^([A-Z])(\d{1,2})$/.exec(slot.toUpperCase());
  return match?.[1] && match[2]
    ? { row: match[1], col: Number(match[2]) }
    : null;
}

function layoutOf(cells: { row: string; col: number }[]): BoxLayout {
  const usesI = cells.some((c) => c.row === "I");
  const maxRow = cells.reduce((m, c) => (c.row > m ? c.row : m), "A");
  const rows: string[] = [];
  for (let code = 65; code <= maxRow.charCodeAt(0); code++) {
    const letter = String.fromCharCode(code);
    if (letter !== "I" || usesI) rows.push(letter);
  }
  return { rows, cols: cells.reduce((m, c) => Math.max(m, c.col), 1) };
}

export function computeLayouts(
  samples: readonly {
    sourceBox: string;
    sourcePosition: string | null;
    slot: string;
  }[],
): JobLayouts {
  const sourceCells = new Map<string, { row: string; col: number }[]>();
  const destCells: { row: string; col: number }[] = [];
  for (const s of samples) {
    const slot = parseSlot(s.slot);
    if (slot) destCells.push(slot);
    const pos = parsePosition(s.sourcePosition);
    if (pos) {
      const kind = boxKind(s.sourceBox);
      const cells = sourceCells.get(kind) ?? [];
      cells.push(pos);
      sourceCells.set(kind, cells);
    }
  }
  return {
    dest: layoutOf(destCells),
    sources: Object.fromEntries(
      [...sourceCells].map(([kind, cells]) => [kind, layoutOf(cells)]),
    ),
  };
}
