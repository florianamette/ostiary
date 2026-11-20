import { describe, expect, it, vi } from "vitest";

import { CSV_BOM, csvField, csvFilename, csvRow, csvStream, escapeFormula, toCsv, type CsvValue } from "@ostiary/core/lib/csv";

describe("csvField", () => {
  it("writes plain text as is", () => {
    expect(csvField("alice@example.com")).toBe("alice@example.com");
    expect(csvField("")).toBe("");
  });

  it("quotes fields with a comma, quote or line break, doubling quotes (RFC 4180)", () => {
    expect(csvField("Doe, Jane")).toBe('"Doe, Jane"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("cr\rhere")).toBe('"cr\rhere"');
  });

  it("writes empty fields for null and undefined", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("writes booleans and numbers", () => {
    expect(csvField(true)).toBe("true");
    expect(csvField(false)).toBe("false");
    expect(csvField(42)).toBe("42");
    expect(csvField(Number.NaN)).toBe("");
  });

  it("writes dates in ISO 8601 UTC", () => {
    expect(csvField(new Date("2026-11-20T09:30:00+02:00"))).toBe("2026-11-20T07:30:00.000Z");
    expect(csvField(new Date("invalid"))).toBe("");
  });

  it("writes objects as JSON, quoted", () => {
    expect(csvField({ role: "admin", count: 2 })).toBe('"{""role"":""admin"",""count"":2}"');
    expect(csvField(["a"])).toBe('"[""a""]"');
  });

  it("keeps non-ASCII text", () => {
    expect(csvField("Zoë Ünal 日本")).toBe("Zoë Ünal 日本");
  });
});

describe("formula injection", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd", "\rcmd"])("prefixes %j with a quote", (text) => {
    expect(escapeFormula(text)).toBe(`'${text}`);
  });

  it("leaves other text alone", () => {
    expect(escapeFormula("a=b")).toBe("a=b");
    expect(escapeFormula("'quoted")).toBe("'quoted");
  });

  it("applies to fields, then quotes when needed", () => {
    expect(csvField('=HYPERLINK("http://evil.test","x")')).toBe('"\'=HYPERLINK(""http://evil.test"",""x"")"');
    expect(csvField("-dash")).toBe("'-dash");
    expect(csvField("\rline")).toBe("\"'\rline\"");
  });

  it("does not touch numbers, booleans or dates", () => {
    expect(csvField(-5)).toBe("-5");
  });
});

describe("csvRow and toCsv", () => {
  it("joins fields with commas and ends with CRLF", () => {
    expect(csvRow(["a", null, true, "b,c"])).toBe('a,,true,"b,c"\r\n');
  });

  it("starts the document with a BOM and the header", () => {
    expect(toCsv(["id", "email"], [["1", "a@example.com"]])).toBe(`${CSV_BOM}id,email\r\n1,a@example.com\r\n`);
  });
});

describe("csvFilename", () => {
  it("names the file with the UTC date", () => {
    expect(csvFilename("users", new Date("2026-11-20T23:30:00-05:00"))).toBe("ostiary-users-2026-11-21.csv");
  });
});

async function* batchesOf(batches: CsvValue[][][]) {
  for (const batch of batches) yield batch;
}

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("csvStream", () => {
  it("streams the header and every batch", async () => {
    const onDone = vi.fn();
    const text = await read(
      csvStream({ header: ["n"], batches: batchesOf([[["1"], ["2"]], [["3"]]]), maxRows: 10, onDone }),
    );
    // Response.text() drops the BOM when decoding; the bytes start with it (checked below).
    expect(text).toBe("n\r\n1\r\n2\r\n3\r\n");
    expect(onDone).toHaveBeenCalledWith({ rows: 3, truncated: false, completed: true });
  });

  it("starts with the UTF-8 byte order mark", async () => {
    const bytes = new Uint8Array(
      await new Response(csvStream({ header: ["n"], batches: batchesOf([]), maxRows: 1 })).arrayBuffer(),
    );
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("stops at the cap and says so in a last line", async () => {
    const onDone = vi.fn();
    const pulled: number[] = [];
    async function* many() {
      for (let i = 0; i < 100; i++) {
        pulled.push(i);
        yield [[String(i * 2)], [String(i * 2 + 1)]];
      }
    }
    const text = await read(csvStream({ header: ["n"], batches: many(), maxRows: 3, onDone }));
    expect(text.split("\r\n")).toEqual(["n", "0", "1", "2", '"# truncated: first 3 rows only, narrow the filters to export the rest"', ""]);
    expect(onDone).toHaveBeenCalledWith({ rows: 3, truncated: true, completed: true });
    expect(pulled).toEqual([0, 1]);
  });

  it("is not truncated when the rows end exactly at the cap", async () => {
    const onDone = vi.fn();
    const text = await read(csvStream({ header: ["n"], batches: batchesOf([[["1"], ["2"]]]), maxRows: 2, onDone }));
    expect(text).toBe("n\r\n1\r\n2\r\n");
    expect(onDone).toHaveBeenCalledWith({ rows: 2, truncated: false, completed: true });
  });

  it("reports a cancelled download as incomplete", async () => {
    const onDone = vi.fn();
    let closed = false;
    async function* endless() {
      try {
        for (;;) yield [["x"]];
      } finally {
        closed = true;
      }
    }
    const reader = csvStream({ header: ["n"], batches: endless(), maxRows: 1000, onDone }).getReader();
    await reader.read();
    await reader.read();
    await reader.cancel();
    expect(closed).toBe(true);
    expect(onDone).toHaveBeenCalledWith({ rows: 1, truncated: false, completed: false });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("errors the stream when a batch fails", async () => {
    const onDone = vi.fn();
    async function* failing() {
      yield [["1"]];
      throw new Error("database gone");
    }
    await expect(read(csvStream({ header: ["n"], batches: failing(), maxRows: 10, onDone }))).rejects.toThrow("database gone");
    expect(onDone).toHaveBeenCalledWith({ rows: 1, truncated: false, completed: false });
  });
});
