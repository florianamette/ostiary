/** A link to an outside page (e.g. Better Auth's docs), opened in a new tab. */
export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="font-medium text-foreground underline-offset-4 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
