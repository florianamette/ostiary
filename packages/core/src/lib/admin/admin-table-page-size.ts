export const ADMIN_TABLE_PAGE_SIZES = [100, 500, 1000] as const;

export type AdminTablePageSize = (typeof ADMIN_TABLE_PAGE_SIZES)[number];

export const DEFAULT_ADMIN_TABLE_PAGE_SIZE: AdminTablePageSize = 100;
