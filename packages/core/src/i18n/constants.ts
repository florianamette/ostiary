const raw =
  typeof process !== "undefined" ? process.env.TZ : undefined;

export const APP_TIME_ZONE =
  raw && raw.trim() !== "" ? raw.trim() : "UTC";
