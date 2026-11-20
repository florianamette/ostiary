/*
 * CSV for downloads opened in spreadsheets (admin exports): RFC 4180 (comma separator, CRLF
 * line endings, fields with a comma, quote or line break quoted, quotes doubled), UTF-8 with a
 * byte order mark so Excel reads accented text right, and timestamps in ISO 8601 UTC.
 *
 * Text that a spreadsheet would run as a formula (`=`, `+`, `-`, `@`, tab or carriage return
 * first) gets a leading `'`, so a user named `=HYPERLINK(...)` stays text (CSV injection).
 */

export type CsvValue = string | number | boolean | Date | null | undefined | Record<string, unknown> | unknown[];

/** The byte order mark that starts the file. */
export const CSV_BOM = "﻿";

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** Neutralises text that a spreadsheet would read as a formula. */
export function escapeFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/**
 * One field: empty for null and undefined, `true`/`false`, ISO 8601 UTC for dates, JSON for
 * objects and arrays. Numbers are written as they are; any text, JSON included, is protected
 * against formulas, then quoted when it must be.
 */
export function csvField(value: CsvValue): string {
  let text: string;
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    text = String(value);
  } else if (value instanceof Date) {
    text = Number.isNaN(value.getTime()) ? "" : value.toISOString();
  } else if (typeof value === "string") {
    text = escapeFormula(value);
  } else {
    text = escapeFormula(JSON.stringify(value));
  }
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One record, ending with CRLF. */
export function csvRow(values: readonly CsvValue[]): string {
  return `${values.map(csvField).join(",")}\r\n`;
}

/** A whole document in memory (BOM, header, rows), for small exports and tests. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return CSV_BOM + csvRow(header) + rows.map(csvRow).join("");
}

/** `ostiary-users-2026-11-20.csv`: the export's name with today's date (UTC). */
export function csvFilename(name: string, now: Date = new Date()): string {
  return `ostiary-${name}-${now.toISOString().slice(0, 10)}.csv`;
}

export type CsvStreamOptions = {
  header: readonly string[];
  /** The rows, a batch at a time (each batch one database page). */
  batches: AsyncIterable<readonly (readonly CsvValue[])[]>;
  /** Stops after this many rows and ends the file with a `# truncated` line. */
  maxRows: number;
  /**
   * Called once when the stream ends: finished (before the last byte is released), failed or
   * cancelled by the client. `rows` is the number of data rows sent.
   */
  onDone?: (summary: { rows: number; truncated: boolean; completed: boolean }) => Promise<void> | void;
};

/**
 * A CSV file as a byte stream, pulling one batch at a time so memory stays flat however many
 * rows there are. At most `maxRows` rows: when there were more, a last line
 * `# truncated: first N rows only` says so (a spreadsheet shows it as a row of its own).
 */
export function csvStream({ header, batches, maxRows, onDone }: CsvStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = batches[Symbol.asyncIterator]();
  let rows = 0;
  let truncated = false;
  let started = false;
  let done = false;

  const finish = async (completed: boolean) => {
    if (done) return;
    done = true;
    await onDone?.({ rows, truncated, completed });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(encoder.encode(CSV_BOM + csvRow(header)));
          return;
        }
        const next = await iterator.next();
        // onDone runs before the file ends, so whoever reads it to the end sees its effect
        // (the export's audit entry).
        if (next.done) {
          await finish(true);
          controller.close();
          return;
        }
        let chunk = "";
        for (const row of next.value) {
          if (rows >= maxRows) {
            truncated = true;
            break;
          }
          chunk += csvRow(row);
          rows++;
        }
        if (!truncated && rows >= maxRows) {
          // Exactly at the cap: one more row would mean the file is incomplete.
          const peek = await iterator.next();
          truncated = !peek.done && peek.value.length > 0;
        }
        if (truncated) {
          chunk += csvRow([`# truncated: first ${maxRows} rows only, narrow the filters to export the rest`]);
          await iterator.return?.();
        }
        if (chunk) controller.enqueue(encoder.encode(chunk));
        if (truncated || rows >= maxRows) {
          await finish(true);
          controller.close();
        }
      } catch (error) {
        controller.error(error);
        await finish(false);
      }
    },
    async cancel() {
      await iterator.return?.();
      await finish(false);
    },
  });
}
