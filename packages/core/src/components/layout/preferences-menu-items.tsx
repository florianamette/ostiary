"use client";

import { Globe, Monitor, Moon, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ostiary/core/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@ostiary/core/i18n/navigation";
import { locales, type AppLocale } from "@ostiary/core/i18n/routing";

/**
 * Language and theme pickers as submenus, for an account or user dropdown. Replaces the
 * floating buttons that used to sit on top of every page.
 */
export function PreferencesMenuItems() {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const tCommon = useTranslations("common");
  const tLocaleNames = useTranslations("common.localeNames");
  const tTheme = useTranslations("admin.themeToggle");

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Globe className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">{tCommon("language")}</span>
          <span className="font-mono text-xs text-muted-foreground">{locale}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-80 min-w-[11rem] overflow-y-auto">
          <DropdownMenuRadioGroup
            value={locale}
            onValueChange={(next) => router.replace(pathname, { locale: next as AppLocale })}
          >
            {locales.map((loc) => (
              <DropdownMenuRadioItem key={loc} value={loc}>
                <span className="w-6 font-mono text-xs text-muted-foreground">{loc}</span>
                {tLocaleNames(loc)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ThemeIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">{tTheme("label")}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">{tTheme("light")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">{tTheme("dark")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">{tTheme("system")}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
