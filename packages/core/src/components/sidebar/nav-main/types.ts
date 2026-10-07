import type { ReactNode } from "react";

export type NavMainItem = {
  title: string;
  url: string;
  icon?: ReactNode;
  /** When true, only `pathname === url` counts as active (e.g. `/admin` vs `/admin/users`). */
  exact?: boolean;
};
