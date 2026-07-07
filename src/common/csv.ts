/** Minimal CSV writer (FR-10.2) — RFC-4180 escaping. */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
