import { and, ne, sql, type SQL } from "drizzle-orm";

import * as schema from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";

/*
 * Addresses that reach the same inbox. Gmail ignores dots in the local part, drops everything
 * after a "+", and treats googlemail.com as gmail.com, so john.doe+x@googlemail.com is
 * johndoe@gmail.com. With EMAIL_DEDUP=gmail only those rules apply (other providers treat dots
 * as part of the address). With EMAIL_DEDUP=plus, the "+tag" is also dropped for every domain:
 * most providers deliver user+tag@ to user@, but a company server may not.
 *
 * The form is computed on the fly (TypeScript for the new address, SQL for stored ones), so
 * changing the setting needs no migration. emailAliasSql must give the same result as
 * emailAlias: email-aliases.test.ts checks both on the same addresses.
 */

export type EmailDedupMode = "off" | "gmail" | "plus";

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** The address every alias of `email` reduces to, or the address itself (lowercased). */
export function emailAlias(email: string, mode: Exclude<EmailDedupMode, "off">): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) return lower;
  const local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  const gmail = GMAIL_DOMAINS.has(domain);
  if (!gmail && mode !== "plus") return lower;
  let base = local.split("+")[0];
  if (gmail) base = base.replaceAll(".", "");
  // "+x@gmail.com" or ".@gmail.com" has no base: keep it as typed rather than match everything empty.
  if (!base) return lower;
  return `${base}@${gmail ? "gmail.com" : domain}`;
}

/** emailAlias, in SQL, applied to a stored address column. */
export function emailAliasSql(column: SQL | typeof schema.user.email, mode: Exclude<EmailDedupMode, "off">): SQL {
  const lower = sql`lower(${column})`;
  const local = sql`regexp_replace(${lower}, '@[^@]*$', '')`;
  const domain = sql`substring(${lower} from '@([^@]*)$')`;
  const gmail = sql`${domain} in ('gmail.com', 'googlemail.com')`;
  const beforePlus = sql`split_part(${local}, '+', 1)`;
  const gmailBase = sql`replace(${beforePlus}, '.', '')`;
  const otherForm = mode === "plus" ? sql`${beforePlus} || '@' || ${domain}` : lower;
  return sql`case
    when position('@' in ${lower}) = 0 or ${local} = '' then ${lower}
    when ${gmail} then case when ${gmailBase} = '' then ${lower} else ${gmailBase} || '@gmail.com' end
    when ${beforePlus} = '' then ${lower}
    else ${otherForm}
  end`;
}

/**
 * Whether another account (not `exceptUserId`) has an address that reaches the same inbox as
 * `email`. An exact match counts too. Always false with mode "off".
 */
export async function emailAliasTaken(
  db: Database,
  email: string,
  mode: EmailDedupMode,
  exceptUserId?: string,
): Promise<boolean> {
  if (mode === "off") return false;
  const sameInbox = sql`${emailAliasSql(schema.user.email, mode)} = ${emailAlias(email, mode)}`;
  const [match] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(exceptUserId ? and(sameInbox, ne(schema.user.id, exceptUserId)) : sameInbox)
    .limit(1);
  return Boolean(match);
}
