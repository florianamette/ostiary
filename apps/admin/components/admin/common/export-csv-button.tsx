import { DownloadIcon } from "lucide-react";

import { Button } from "@ostiary/core/components/ui/button";

/**
 * Downloads a list as CSV with its current filters (`href`, an /api/admin/.../export route). A
 * plain link: the browser saves the file, the console stays on the page.
 */
export function ExportCsvButton({ href, label, title }: { href: string; label: string; title?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} download title={title}>
        <DownloadIcon aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}
