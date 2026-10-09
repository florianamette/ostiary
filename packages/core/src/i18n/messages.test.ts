import { readFileSync } from "node:fs";
import path from "node:path";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import { locales } from "@ostiary/core/i18n/routing";

/*
 * Every locale has the keys of en.json, no others, and each message uses the same ICU
 * arguments and rich-text tags as English. Plural categories may differ (languages need
 * different ones).
 *
 * Values still identical to English are only reported (see ALLOWED_AS_ENGLISH), not failed:
 * some are right ("OAuth", "Webhooks" in French, example addresses).
 */

type Messages = { [key: string]: string | Messages };

const messagesDir = path.resolve(__dirname, "../../messages");
const load = (locale: string): Messages =>
  JSON.parse(readFileSync(path.join(messagesDir, `${locale}.json`), "utf8")) as Messages;

function flatten(messages: Messages, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(full, value);
    else for (const [k, v] of flatten(value, full)) out.set(k, v);
  }
  return out;
}

/**
 * Sorted argument names and "<tag>" names, branches included. Argument types are not
 * compared: `{count, plural, ...}` may be a plain `{count}` in languages without plurals.
 */
function signature(message: string): string[] {
  const found = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (el.type === TYPE.tag) {
        found.add(`<${el.value}>`);
        walk(el.children);
      } else if (el.type === TYPE.select || el.type === TYPE.plural) {
        found.add(`{${el.value}}`);
        for (const option of Object.values(el.options)) walk(option.value);
      } else if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) {
        found.add(`{${el.value}}`);
      }
    }
  };
  walk(parse(message));
  return [...found].sort();
}

/** Values that may stay in English in every locale: names, acronyms, examples. */
const ALLOWED_AS_ENGLISH = new Set<string>([
  "OAuth",
  "SSO",
  "SAML",
  "SCIM",
  "OIDC",
  "PKCE",
  "API",
  "APIs",
  "JWKS URL",
  "Client ID",
  "Okta",
  "Microsoft Entra ID",
  "Google Workspace",
  "JumpCloud",
  "Ostiary",
  "URL",
  "IP",
  "Slug",
  "Webhooks",
  "Scopes",
  "SSO: {provider}",
  "{label}: <value>{ratio}:1</value>",
  "Dynamic Client Registration (RFC 7591)",
  "Client ID Metadata Documents",
  // Field names as the providers' own consoles show them.
  "Services ID",
  "Team ID",
  "Key ID",
  "AppID",
  "AppSecret",
  "App key",
  "App secret",
  "Channel ID",
  "Channel secret",
  "Consumer key",
  "Consumer secret",
  "My Domain",
  "GitLab URL",
  "m@example.com",
  "you@example.com",
  "your_username",
]);

const en = flatten(load("en"));
const others = locales.filter((locale) => locale !== "en");

describe("messages", () => {
  it("en.json is valid ICU", () => {
    for (const [key, value] of en) {
      expect(() => signature(value), key).not.toThrow();
    }
  });

  it.each(others)("%s has exactly the keys of en.json", (locale) => {
    const messages = flatten(load(locale));
    const missing = [...en.keys()].filter((key) => !messages.has(key));
    const extra = [...messages.keys()].filter((key) => !en.has(key));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it.each(others)("%s uses the same ICU arguments and tags as English", (locale) => {
    const messages = flatten(load(locale));
    const mismatches: string[] = [];
    for (const [key, value] of messages) {
      const english = en.get(key);
      if (english === undefined) continue;
      let ours: string[];
      try {
        ours = signature(value);
      } catch (error) {
        mismatches.push(`${key}: invalid ICU (${(error as Error).message})`);
        continue;
      }
      const theirs = signature(english);
      if (ours.join(" ") !== theirs.join(" ")) {
        mismatches.push(`${key}: ${ours.join(" ") || "(none)"} instead of ${theirs.join(" ") || "(none)"}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("reports values identical to English (informational)", () => {
    const lines: string[] = [];
    for (const locale of others) {
      const messages = flatten(load(locale));
      const same = [...messages].filter(
        ([key, value]) => en.get(key) === value && !ALLOWED_AS_ENGLISH.has(value) && /[A-Za-z]{2}/.test(value),
      );
      if (same.length > 0) lines.push(`${locale}: ${same.length} (${same.map(([key]) => key).join(", ")})`);
    }
    if (lines.length > 0 && process.env.I18N_REPORT) {
      process.stdout.write(`Messages identical to English, not in the allowlist:\n${lines.join("\n")}\n`);
    }
    expect(true).toBe(true);
  });
});
