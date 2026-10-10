import { eq } from "drizzle-orm";

import { db } from "@ostiary/core/db/index";
import { appSetting } from "@ostiary/core/db/schema";

/** The stored value of one `app_setting` row, undefined when it was never saved. */
export async function readAppSetting(key: string): Promise<unknown> {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, key))
    .limit(1);
  return row?.value;
}

/** Creates or replaces one `app_setting` row. */
export async function writeAppSetting(key: string, value: unknown, updatedBy: string | null): Promise<void> {
  const now = new Date();
  await db
    .insert(appSetting)
    .values({ key, value, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedAt: now, updatedBy } });
}
