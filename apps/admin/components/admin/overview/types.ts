export type OverviewStatDefinition = {
  title: string;
  value: string;
  /** When set, shows delta badge in header */
  delta?: string;
  positive?: boolean;
  /** When set with trendDirection, shows trend row above hint */
  trend?: string;
  trendDirection?: "up" | "down";
  hint: string;
};
