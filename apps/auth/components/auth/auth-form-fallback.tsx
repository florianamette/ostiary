/** A placeholder of a sign-in screen's card while it loads. */
export function AuthFormFallback({ height = "h-80" }: { height?: "h-64" | "h-80" }) {
  return <div className={`${height} w-full max-w-md animate-pulse rounded-xl bg-muted/60`} />;
}
