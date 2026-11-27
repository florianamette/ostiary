import { describe, expect, it } from "vitest";

import { removeHtmlComments } from "@ostiary/core/lib/app-icons/html-comments";

describe("removeHtmlComments", () => {
  it("removes each comment up to the next -->", () => {
    expect(removeHtmlComments('a<!-- x -->b<!--y-->c')).toBe("abc");
    expect(removeHtmlComments('<!-- <link rel="icon" href="/hidden.png"> -->ok')).toBe("ok");
  });

  it("does not nest, and an unclosed comment runs to the end", () => {
    expect(removeHtmlComments("a<!-- <!-- x --> b -->c")).toBe("a b -->c");
    expect(removeHtmlComments('a<!-- <link rel="icon" href="/x.png">')).toBe("a");
  });

  it("leaves text without comments as it is", () => {
    expect(removeHtmlComments("<head><title>x</title></head>")).toBe("<head><title>x</title></head>");
  });
});
