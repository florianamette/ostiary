import { BookOpenIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/** The page's documentation on ostiary.dev, at the bottom of a page, in place of API details. */
export function DocsLink({ path }: { path: string }) {
  const t = useTranslations("admin.common");
  return (
    <p className="text-muted-foreground text-xs">
      <a
        href={`https://www.ostiary.dev/docs/${path}`}
        className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        <BookOpenIcon className="size-3.5" aria-hidden />
        {t("docs")}
      </a>
    </p>
  );
}
