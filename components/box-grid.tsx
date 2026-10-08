import type { ReactNode } from "react";

import type { BoxLayout } from "@/lib/pipeline/layout";

import { cx } from "./ui";

/**
 * A box drawn as its grid of positions, e.g. a 10×10 destination box or a
 * 5×20 source box, with one or more cells highlighted. Cells are keyed
 * "<row><col>" ("G6").
 */
export function BoxGrid({
  layout,
  highlight,
  highlightClass = "bg-slate-900 text-white",
  cellClass,
  renderCell,
  size = "md",
  onCellClick,
  label,
}: {
  layout: BoxLayout;
  highlight?: string | null;
  highlightClass?: string;
  cellClass?: (key: string) => string | undefined;
  renderCell?: (key: string) => ReactNode;
  size?: "sm" | "md" | "lg";
  onCellClick?: (key: string) => void;
  label?: string;
}) {
  const cols = Array.from({ length: layout.cols }, (_, i) => i + 1);
  const text = size === "lg" ? "text-xs" : "text-[10px]";
  return (
    <div
      role="grid"
      aria-label={label}
      className={cx("grid gap-px", text)}
      style={{
        gridTemplateColumns: `auto repeat(${layout.cols}, minmax(0, 1fr))`,
      }}
    >
      <div />
      {cols.map((c) => (
        <div key={c} className="text-center font-medium text-slate-400">
          {c}
        </div>
      ))}
      {layout.rows.map((row) => (
        <div key={row} role="row" className="contents">
          <div className="pr-1 text-right font-medium text-slate-400">
            {row}
          </div>
          {cols.map((c) => {
            const key = `${row}${c}`;
            const isHighlight = key === highlight;
            const Tag = onCellClick ? "button" : "div";
            return (
              <Tag
                key={key}
                role="gridcell"
                aria-selected={isHighlight || undefined}
                onClick={onCellClick ? () => onCellClick(key) : undefined}
                className={cx(
                  "flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-[3px]",
                  isHighlight
                    ? cx(highlightClass, "ring-2 ring-slate-900 ring-offset-1")
                    : (cellClass?.(key) ?? "bg-slate-100"),
                  onCellClick &&
                    "cursor-pointer hover:ring-2 hover:ring-slate-400",
                )}
              >
                {renderCell?.(key) ??
                  (isHighlight && size !== "sm" ? key : null)}
              </Tag>
            );
          })}
        </div>
      ))}
    </div>
  );
}
