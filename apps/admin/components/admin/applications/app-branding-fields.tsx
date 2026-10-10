"use client";

import { useTranslations } from "next-intl";

import { Field, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import type { AccentPalette } from "@ostiary/core/lib/app-branding/color";
import type { LogoSource } from "@ostiary/core/lib/app-branding/validation";
import { brand } from "@ostiary/core/lib/brand";
import { cn } from "@ostiary/core/lib/utils";
import { AccentContrast } from "@/components/admin/applications/app-branding-preview";

export type BrandingFormState = {
  displayName: string;
  tagline: string;
  accentEnabled: boolean;
  accentColor: string;
  logoSource: LogoSource;
  logoUrl: string;
  panelText: string;
  socialMode: "all" | "some";
  socialProviders: string[];
};

export type UpdateBrandingForm = <K extends keyof BrandingFormState>(key: K, value: BrandingFormState[K]) => void;

/** The accent color: off, or a color with its contrast check. */
export function AccentField({
  form,
  update,
  accent,
  palette,
  id,
}: {
  form: BrandingFormState;
  update: UpdateBrandingForm;
  /** The normalized accent color, or null when it is off or not a valid color. */
  accent: string | null;
  palette: AccentPalette | null;
  id: (name: string) => string;
}) {
  const t = useTranslations("admin.pages.applications.branding");
  return (
    <Field>
      <div className="flex items-center gap-2">
        <input
          id={id("accent-on")}
          type="checkbox"
          className="size-4 rounded border-input"
          checked={form.accentEnabled}
          onChange={(e) => update("accentEnabled", e.target.checked)}
        />
        <Label htmlFor={id("accent-on")} className="font-medium">
          {t("accent")}
        </Label>
      </div>
      {form.accentEnabled ? (
        <>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("accentPick")}
              className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
              value={accent ?? "#000000"}
              onChange={(e) => update("accentColor", e.target.value)}
            />
            <Input
              id={id("accent")}
              aria-label={t("accentHex")}
              value={form.accentColor}
              className="w-32 font-mono"
              aria-invalid={!accent}
              onChange={(e) => update("accentColor", e.target.value)}
            />
          </div>
          {palette ? (
            <AccentContrast palette={palette} />
          ) : (
            <p className="text-destructive text-xs">{t("hexInvalid", { example: "#2563eb" })}</p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-xs">{t("accentOff")}</p>
      )}
    </Field>
  );
}

/** Where the logo comes from: the app icon, a URL or an upload. */
export function LogoField({
  form,
  update,
  onLogoFile,
  logoNote,
  id,
}: {
  form: BrandingFormState;
  update: UpdateBrandingForm;
  onLogoFile: (file: File | null) => void;
  logoNote: string | null;
  id: (name: string) => string;
}) {
  const t = useTranslations("admin.pages.applications.branding");
  return (
    <Field>
      <FieldLabel>{t("logo")}</FieldLabel>
      <div role="radiogroup" aria-label={t("logoSourceLabel")} className="flex flex-wrap gap-2">
        {(["app_icon", "url", "upload"] as const).map((value) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
              form.logoSource === value ? "border-foreground/40 bg-muted" : "border-border",
            )}
          >
            <input
              type="radio"
              name={id("logo-source")}
              value={value}
              checked={form.logoSource === value}
              onChange={() => update("logoSource", value)}
            />
            {t(`logoSource.${value}`)}
          </label>
        ))}
      </div>
      {form.logoSource === "app_icon" ? (
        <p className="text-muted-foreground text-xs">{t("logoAppIconHint", { field: "logo_uri" })}</p>
      ) : null}
      {form.logoSource === "url" ? (
        <>
          <Input
            aria-label={t("logoUrl")}
            value={form.logoUrl}
            placeholder="https://cdn.example.com/logo.svg"
            className="font-mono text-xs"
            onChange={(e) => update("logoUrl", e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {t("logoUrlHint", { name: brand.name })}
          </p>
        </>
      ) : null}
      {form.logoSource === "upload" ? (
        <>
          <Input
            aria-label={t("logoFile")}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml,image/x-icon"
            onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-muted-foreground text-xs">{t("logoFileHint")}</p>
        </>
      ) : null}
      {logoNote ? <p className="text-muted-foreground text-xs">{logoNote}</p> : null}
    </Field>
  );
}

/** Which social sign-in buttons the app shows: all of them or some. */
export function SocialProvidersField({
  form,
  update,
  providers,
}: {
  form: BrandingFormState;
  update: UpdateBrandingForm;
  providers: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.pages.applications.branding");
  return (
    <Field>
      <FieldLabel>{t("social")}</FieldLabel>
      {providers.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("socialNone")}</p>
      ) : (
        <>
          <div role="radiogroup" aria-label={t("socialShown")} className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.socialMode === "all"} onChange={() => update("socialMode", "all")} />
              {t("socialAll")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.socialMode === "some"} onChange={() => update("socialMode", "some")} />
              {t("socialSome")}
            </label>
          </div>
          {form.socialMode === "some" ? (
            <div className="flex flex-wrap gap-3 text-sm">
              {providers.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.socialProviders.includes(p.id)}
                    onChange={(e) =>
                      update(
                        "socialProviders",
                        e.target.checked ? [...form.socialProviders, p.id] : form.socialProviders.filter((x) => x !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("socialHint")}
          </p>
        </>
      )}
    </Field>
  );
}
