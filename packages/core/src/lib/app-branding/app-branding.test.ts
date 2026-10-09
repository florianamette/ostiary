import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";

import {
  accentCssVariables,
  accentForSurface,
  accentPalette,
  BRANDING_SURFACES,
  contrastRatio,
  normalizeHexColor,
  readableForeground,
} from "@ostiary/core/lib/app-branding/color";
import {
  APP_CONTEXT_TTL_SECONDS,
  authorizeQueryOf,
  createAppContextToken,
  SIGNED_QUERY_BRANDING_GRACE_SECONDS,
  verifyAppContext,
  verifyAppContextToken,
  verifySignedOAuthQuery,
} from "@ostiary/core/lib/app-branding/context";
import {
  validateBrandingInput,
  validateLogoUpload,
  validatePanelImageUpload,
} from "@ostiary/core/lib/app-branding/validation";

const SECRET = "test-secret-test-secret-test-secret-0123";

/** Signs a query the way Better Auth's oauth-provider does before redirecting to /login. */
async function signLikeBetterAuth(query: Record<string, string>, expSeconds: number, secret = SECRET): Promise<string> {
  const params = new URLSearchParams(query);
  params.set("exp", String(expSeconds));
  params.set("ba_iat", String(expSeconds * 1000 - 600_000));
  const names = [...new Set([...params.keys(), "ba_param"])].sort();
  for (const name of names) params.append("ba_param", name);
  const canonical = new URLSearchParams(
    [...params.entries()].sort(([ka, va], [kb, vb]) => (ka < kb ? -1 : ka > kb ? 1 : va < vb ? -1 : va > vb ? 1 : 0)),
  );
  params.set("sig", await makeSignature(canonical.toString(), secret));
  return params.toString();
}

const AUTHORIZE = {
  response_type: "code",
  client_id: "cyber-library",
  redirect_uri: "https://library.example.com/callback",
  scope: "openid profile email",
  state: "xyz",
  code_challenge: "abc",
  code_challenge_method: "S256",
};

describe("accent colors", () => {
  it("normalizes hex input", () => {
    expect(normalizeHexColor("#ABC")).toBe("#aabbcc");
    expect(normalizeHexColor("2563EB")).toBe("#2563eb");
    expect(normalizeHexColor(" #2563eb ")).toBe("#2563eb");
    expect(normalizeHexColor("red")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("url(x)")).toBeNull();
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("always finds an AA label color for any accent", () => {
    for (let i = 0; i < 4096; i += 7) {
      const hex = `#${[i >> 8, (i >> 4) & 15, i & 15].map((n) => (n * 17).toString(16).padStart(2, "0")).join("")}`;
      expect(contrastRatio(hex, readableForeground(hex))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("adjusts the accent as text until it reaches 4.5:1 on each surface", () => {
    const yellow = "#facc15";
    const onLight = accentForSurface(yellow, BRANDING_SURFACES.light.card);
    expect(onLight).not.toBe(yellow);
    expect(contrastRatio(onLight, BRANDING_SURFACES.light.card)).toBeGreaterThanOrEqual(4.5);
    const navy = "#1e3a8a";
    const onDark = accentForSurface(navy, BRANDING_SURFACES.dark.card);
    expect(contrastRatio(onDark, BRANDING_SURFACES.dark.card)).toBeGreaterThanOrEqual(4.5);
    // Already fine: untouched.
    expect(accentForSurface(navy, BRANDING_SURFACES.light.card)).toBe(navy);
  });

  it("warns when a button would not stand out from a card", () => {
    expect(accentPalette("#facc15").warnings).toEqual(["light_ui"]);
    expect(accentPalette("#1e1b4b").warnings).toEqual(["dark_ui"]);
    expect(accentPalette("#2563eb").warnings).toEqual([]);
  });

  it("exposes only the documented CSS variables", () => {
    expect(Object.keys(accentCssVariables("#2563eb")).sort()).toEqual([
      "--app-accent",
      "--app-accent-foreground",
      "--app-accent-text-dark",
      "--app-accent-text-light",
    ]);
  });
});

describe("signed OAuth query", () => {
  const now = Date.UTC(2026, 9, 9, 12);
  const exp = Math.floor(now / 1000) + 600;

  it("accepts what Better Auth accepts", async () => {
    // The library's own check (on the real clock) agrees on how the request is signed.
    const live = await signLikeBetterAuth(AUTHORIZE, Math.floor(Date.now() / 1000) + 600);
    expect(await verifyOAuthQueryParams(live, SECRET)).toBe(true);
    expect(verifySignedOAuthQuery(live, SECRET)?.clientId).toBe("cyber-library");
    const query = await signLikeBetterAuth(AUTHORIZE, exp);
    const context = verifySignedOAuthQuery(query, SECRET, now);
    expect(context?.clientId).toBe("cyber-library");
    expect(context?.source).toBe("signed_query");
    expect(new URLSearchParams(context!.authorizeQuery).get("sig")).toBeNull();
    expect(new URLSearchParams(context!.authorizeQuery).get("redirect_uri")).toBe(AUTHORIZE.redirect_uri);
  });

  it("ignores extra unsigned parameters such as callbackURL", async () => {
    const query = await signLikeBetterAuth(AUTHORIZE, exp);
    expect(verifySignedOAuthQuery(`${query}&callbackURL=%2Fx&addAccount=1`, SECRET, now)?.clientId).toBe("cyber-library");
  });

  it("refuses a forged or swapped client_id", async () => {
    const query = new URLSearchParams(await signLikeBetterAuth(AUTHORIZE, exp));
    query.set("client_id", "someone-else");
    expect(verifySignedOAuthQuery(query, SECRET, now)).toBeNull();
    expect(verifySignedOAuthQuery("client_id=cyber-library", SECRET, now)).toBeNull();
    expect(verifySignedOAuthQuery(await signLikeBetterAuth(AUTHORIZE, exp, "another-secret-another-secret-xx"), SECRET, now)).toBeNull();
  });

  it("refuses an unsigned extra client_id and duplicate signatures", async () => {
    const signed = await signLikeBetterAuth(AUTHORIZE, exp);
    expect(verifySignedOAuthQuery(`${signed}&client_id=other`, SECRET, now)).toBeNull();
    expect(verifySignedOAuthQuery(`${signed}&sig=abc`, SECRET, now)).toBeNull();
  });

  it("refuses a query whose signed names leave client_id out", async () => {
    const { client_id: _omit, ...rest } = AUTHORIZE;
    void _omit;
    const signed = await signLikeBetterAuth(rest, exp);
    expect(verifySignedOAuthQuery(`${signed}&client_id=cyber-library`, SECRET, now)).toBeNull();
  });

  it("keeps the app for a grace period after exp, then drops it", async () => {
    const query = await signLikeBetterAuth(AUTHORIZE, exp);
    expect(verifySignedOAuthQuery(query, SECRET, exp * 1000 + 60_000)?.clientId).toBe("cyber-library");
    expect(verifySignedOAuthQuery(query, SECRET, (exp + SIGNED_QUERY_BRANDING_GRACE_SECONDS + 1) * 1000)).toBeNull();
  });

  it("builds the request to resume without signing parameters or prompt=login", () => {
    const params = new URLSearchParams({ ...AUTHORIZE, prompt: "login consent", exp: "1", ba_iat: "2", sig: "x" });
    params.append("ba_param", "client_id");
    const resumed = new URLSearchParams(authorizeQueryOf(params));
    expect(resumed.get("prompt")).toBe("consent");
    expect([...resumed.keys()].some((k) => k.startsWith("ba_") || k === "sig" || k === "exp")).toBe(false);
    expect(new URLSearchParams(authorizeQueryOf(new URLSearchParams({ prompt: "create" }))).has("prompt")).toBe(false);
  });
});

describe("app context token", () => {
  const now = Date.UTC(2026, 9, 9, 12);
  const context = { clientId: "cyber-library", authorizeQuery: new URLSearchParams(AUTHORIZE).toString() };

  it("round-trips and expires", () => {
    const token = createAppContextToken(context, SECRET, now);
    expect(verifyAppContextToken(token, SECRET, now)?.clientId).toBe("cyber-library");
    expect(verifyAppContextToken(token, SECRET, now + (APP_CONTEXT_TTL_SECONDS + 1) * 1000)).toBeNull();
    expect(verifyAppContext({ app: token }, SECRET, now)?.source).toBe("token");
  });

  it("refuses tampering, other secrets and garbage", () => {
    const token = createAppContextToken(context, SECRET, now);
    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ c: "evil", q: "client_id=evil", e: 9e9 })).toString("base64url");
    expect(verifyAppContextToken(`${forged}.${mac}`, SECRET, now)).toBeNull();
    expect(verifyAppContextToken(`${payload}.${mac}x`, SECRET, now)).toBeNull();
    expect(verifyAppContextToken(token, "another-secret-another-secret-xx", now)).toBeNull();
    expect(verifyAppContextToken("nope", SECRET, now)).toBeNull();
    expect(verifyAppContextToken(`${token}.x`, SECRET, now)).toBeNull();
  });

  it("refuses a token whose request names another client", () => {
    const token = createAppContextToken({ clientId: "a", authorizeQuery: "client_id=b" }, SECRET, now);
    expect(verifyAppContextToken(token, SECRET, now)).toBeNull();
  });

  it("prefers a signed request over a token", async () => {
    const token = createAppContextToken({ clientId: "other", authorizeQuery: "client_id=other" }, SECRET, now);
    const query = await signLikeBetterAuth(AUTHORIZE, Math.floor(now / 1000) + 600);
    expect(verifyAppContext(`${query}&app=${token}`, SECRET, now)?.clientId).toBe("cyber-library");
  });
});

describe("branding input", () => {
  it("cleans text and validates colors and URLs", () => {
    const result = validateBrandingInput(
      {
        displayName: "  Cyber‮ Library \n",
        tagline: "",
        accentColor: "#ABC",
        logoSource: "url",
        logoUrl: "https://cdn.example.com/logo.svg",
        socialProviders: ["github", "github", "unknown"],
      },
      ["github", "google"],
    );
    expect(result).toEqual({
      ok: true,
      value: {
        displayName: "Cyber Library",
        tagline: null,
        accentColor: "#aabbcc",
        logoSource: "url",
        logoUrl: "https://cdn.example.com/logo.svg",
        panelText: null,
        socialProviders: ["github"],
      },
    });
  });

  it("refuses bad values", () => {
    expect(validateBrandingInput({ accentColor: "red" }, []).ok).toBe(false);
    expect(validateBrandingInput({ logoSource: "url", logoUrl: "http://example.com/x.png" }, []).ok).toBe(false);
    expect(validateBrandingInput({ logoSource: "url", logoUrl: "https://127.0.0.1/x.png" }, []).ok).toBe(false);
    expect(validateBrandingInput({ logoSource: "javascript" }, []).ok).toBe(false);
    expect(validateBrandingInput({ tagline: "x".repeat(121) }, []).ok).toBe(false);
  });

  it("checks uploads by their bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(validateLogoUpload(png).ok).toBe(true);
    expect(validateLogoUpload(svg).ok).toBe(true);
    expect(validateLogoUpload(html).ok).toBe(false);
    expect(validateLogoUpload(new Uint8Array(300 * 1024).fill(0x89)).ok).toBe(false);
    expect(validatePanelImageUpload(png).ok).toBe(true);
    expect(validatePanelImageUpload(svg).ok).toBe(false);
  });
});
