/** What an admin server action returns: success (with `T`'s fields), or an error to show. */
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
