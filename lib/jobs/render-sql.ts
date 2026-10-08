import { escapeLiteral } from "pg";

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return escapeLiteral(value);
  return escapeLiteral(JSON.stringify(value));
}

/**
 * Inlines a parameterized statement's values ($1, $2, ...) as SQL literals.
 * Only for SQL that Drizzle generated: it puts every value in a parameter,
 * so the text itself contains no literals a "$n" could hide in.
 */
export function renderStatement(
  sql: string,
  params: readonly unknown[],
): string {
  return sql.replace(/\$(\d+)/g, (_, n: string) =>
    literal(params[Number(n) - 1]),
  );
}
