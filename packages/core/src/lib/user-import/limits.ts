/** Largest file accepted by an import (both files together for Auth0 with a password hash export). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
/** Most users in one import. Larger exports are imported in several files. */
export const MAX_IMPORT_USERS = 50_000;
/** Users written per database transaction. */
export const IMPORT_BATCH_SIZE = 500;
/** Rows with an error listed in the dry run (all of them are counted). */
export const MAX_REPORTED_ROW_ERRORS = 50;
