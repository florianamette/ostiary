"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@ostiary/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ostiary/core/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@ostiary/core/i18n/navigation";
import { locales, type AppLocale } from "@ostiary/core/i18n/routing";

export function LocaleSwitcher() {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("common");
  const tLocaleNames = useTranslations("common.localeNames");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          type="button"
          className="relative border-border/80 bg-background/80 backdrop-blur-sm"
          aria-label={t("language")}
        >
          <Globe className="size-4" aria-hidden />
          <span className="sr-only">{t("language")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            className={
              loc === locale
                ? "flex items-center gap-2 bg-accent"
                : "flex items-center gap-2"
            }
            onClick={() => router.replace(pathname, { locale: loc })}
          >
            <span className="font-mono text-xs text-muted-foreground">
              {loc}
            </span>
            <span>{tLocaleNames(loc)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
