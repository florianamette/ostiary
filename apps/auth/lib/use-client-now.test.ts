import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useClientNow } from "@/lib/use-client-now";

function Probe() {
  const now = useClientNow();
  return createElement("span", null, now === null ? "no time" : "a time");
}

describe("useClientNow", () => {
  // The server render (and so the hydration render) must not depend on the time: text that
  // differs between the two makes hydration fail and leaves the page's buttons dead.
  it("gives no time to the server render", () => {
    expect(renderToString(createElement(Probe))).toBe("<span>no time</span>");
  });
});
