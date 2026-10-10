import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";

/** A titled card on an admin detail page. */
export function Section({
  id,
  title,
  description,
  contentClassName,
  children,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

/** The "nothing here" line of a section. */
export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Number tiles above an admin page's content. */
export function StatTiles({ tiles, locale }: { tiles: { label: string; value: number }[]; locale: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{tile.value.toLocaleString(locale)}</p>
        </div>
      ))}
    </div>
  );
}
