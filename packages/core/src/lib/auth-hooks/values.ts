/** A request body, query or response, read field by field. */
export type Bag = Record<string, unknown>;

export const str = (v: unknown) => (typeof v === "string" ? v : undefined);
