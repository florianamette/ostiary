"use client";

import * as React from "react";
import { AlertTriangleIcon, CheckIcon, Loader2Icon, MoonIcon, SunIcon } from "lucide-react";

import { AppIcon } from "@ostiary/core/components/app-icon";
import { Logo } from "@ostiary/core/components/brand/logo";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ostiary/core/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import { Textarea } from "@ostiary/core/components/ui/textarea";
import {
  AA_TEXT,
  AA_UI,
  accentCssVariables,
  accentPalette,
  normalizeHexColor,
} from "@ostiary/core/lib/app-branding/color";
import { BRANDING_LIMITS, type LogoSource } from "@ostiary/core/lib/app-branding/validation";
import type { AppBrandingSettings } from "@ostiary/core/lib/app-branding/store";
import { brand } from "@ostiary/core/lib/brand";
import { cn } from "@ostiary/core/lib/utils";
import type { SocialProviderOption } from "@ostiary/core/lib/social-provider-meta";
import {
  loadAppBranding,
  resetAppBrandingAction,
  saveAppBrandingAction,
  type BrandingDialogData,
} from "@/app/[locale]/(console)/applications/branding-actions";
import { adminAppIconUrl } from "@/lib/app-icon-url";

function assetUrl(clientId: string, asset: "logo" | "panel", version: string | null) {
  return `/api/admin/app-branding/${encodeURIComponent(clientId)}/${asset}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}

/** An object URL for a picked file, revoked when it changes. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

type FormState = {
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

function toForm(settings: AppBrandingSettings): FormState {
  return {
    displayName: settings.displayName ?? "",
    tagline: settings.tagline ?? "",
    accentEnabled: Boolean(settings.accentColor),
    accentColor: settings.accentColor ?? "#2563eb",
    logoSource: settings.logoSource,
    logoUrl: settings.logoUrl ?? "",
    panelText: settings.panelText ?? "",
    socialMode: settings.socialProviders ? "some" : "all",
    socialProviders: settings.socialProviders ?? [],
  };
}

function Ratio({ label, value, min, hint }: { label: string; value: number; min: number; hint?: string }) {
  const ok = value >= min;
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      )}
      <span>
        {label}: <span className="font-medium tabular-nums">{value.toFixed(2)}:1</span>{" "}
        <span className="text-muted-foreground">({ok ? `passes ${min}:1` : `below ${min}:1`})</span>
        {hint ? <span className="block text-muted-foreground">{hint}</span> : null}
      </span>
    </li>
  );
}

/**
 * The branded sign-in screen in miniature: the side panel (wide screens) and the form column,
 * with the same `[data-app-brand]` variables the auth app sets.
 */
function BrandingPreview({
  dark,
  name,
  tagline,
  logoSrc,
  accent,
  panelText,
  panelImage,
  socialProviders,
}: {
  dark: boolean;
  name: string;
  tagline: string;
  logoSrc: string | null;
  accent: string | null;
  panelText: string;
  panelImage: string | null;
  socialProviders: SocialProviderOption[];
}) {
  const vars = accent ? (accentCssVariables(accent) as React.CSSProperties) : undefined;
  return (
    <div className={cn("overflow-hidden rounded-lg border shadow-sm", dark && "dark")} aria-label="Sign-in page preview">
      <div className="grid min-h-[22rem] grid-cols-[2fr_3fr] bg-background text-foreground">
        <div className="dark relative flex flex-col justify-between overflow-hidden border-e bg-background p-4 text-foreground">
          {panelImage ? (
            <div aria-hidden className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={panelImage} alt="" className="size-full object-cover" />
              <div className="absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--background)_55%,transparent),color-mix(in_oklab,var(--background)_35%,transparent)_40%,var(--background)_95%)]" />
            </div>
          ) : null}
          <Logo className="relative scale-90 origin-top-left" />
          <p className="relative text-lg leading-tight font-semibold tracking-tight text-pretty">
            {panelText || brand.tagline}
          </p>
          <p className="relative text-[10px] text-muted-foreground">Secured by {brand.name}.</p>
        </div>
        <div className="flex items-center p-4" data-app-brand={accent ? "accent" : "plain"} style={vars}>
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
              <AppIcon name={name || "App"} src={logoSrc} size={36} />
              <div className="min-w-0 text-xs leading-snug text-muted-foreground">
                Sign in to continue to
                <strong className="block truncate text-sm font-semibold text-[var(--app-accent-text,var(--foreground))]">
                  {name || "App"}
                </strong>
                {tagline ? <span className="line-clamp-1 text-[11px]">{tagline}</span> : null}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border bg-card p-3 text-card-foreground">
              <p className="text-sm font-semibold">Sign in</p>
              <div className="h-7 rounded-md border border-input bg-background/60" />
              <div className="h-7 rounded-md border border-input bg-background/60" />
              <div className="flex h-7 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">
                Sign in
              </div>
              {socialProviders.length ? (
                <div className="flex flex-wrap gap-1">
                  {socialProviders.slice(0, 4).map((p) => (
                    <span key={p.id} className="rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {p.name}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="text-[10px] text-muted-foreground">
                No account? <span className="underline decoration-[var(--ring)] underline-offset-2">Create one</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppBrandingDialog({
  clientId,
  open,
  onOpenChange,
  onNotify,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNotify: (message: string, variant?: "error" | "success") => void;
}) {
  const [data, setData] = React.useState<BrandingDialogData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [panelFile, setPanelFile] = React.useState<File | null>(null);
  const [removePanel, setRemovePanel] = React.useState(false);
  const [pending, setPending] = React.useState<"save" | "reset" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [darkPreview, setDarkPreview] = React.useState(false);
  const logoPreview = useObjectUrl(logoFile);
  const panelPreview = useObjectUrl(panelFile);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    setForm(null);
    setLoadError(null);
    setError(null);
    setLogoFile(null);
    setPanelFile(null);
    setRemovePanel(false);
    void loadAppBranding(clientId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setData(result.data);
      setForm(toForm(result.data.settings));
    });
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const accent = form?.accentEnabled ? normalizeHexColor(form.accentColor) : null;
  const palette = accent ? accentPalette(accent) : null;
  const saved = data?.settings ?? null;

  let logoSrc: string | null = null;
  let logoNote: string | null = null;
  if (form && saved) {
    if (form.logoSource === "upload") {
      logoSrc = logoPreview ?? (saved.hasLogoUpload ? assetUrl(clientId, "logo", saved.updatedAt) : null);
    } else if (form.logoSource === "url") {
      const unchanged = saved.logoSource === "url" && saved.logoUrl === form.logoUrl.trim();
      logoSrc = unchanged ? assetUrl(clientId, "logo", saved.updatedAt) : null;
      if (!unchanged) logoNote = "The server fetches the logo when you save; the preview shows it then.";
    } else {
      logoSrc = adminAppIconUrl(clientId);
    }
  }
  const panelSrc = removePanel ? null : (panelPreview ?? (saved?.hasPanelImage ? assetUrl(clientId, "panel", saved.updatedAt) : null));
  const previewProviders =
    data && form ? (form.socialMode === "all" ? data.socialProviders : data.socialProviders.filter((p) => form.socialProviders.includes(p.id))) : [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    if (form.accentEnabled && !accent) {
      setError("Enter the accent as a hex color such as #2563eb.");
      return;
    }
    const body = new FormData();
    body.set("displayName", form.displayName);
    body.set("tagline", form.tagline);
    body.set("accentColor", form.accentEnabled ? form.accentColor : "");
    body.set("logoSource", form.logoSource);
    body.set("logoUrl", form.logoUrl);
    body.set("panelText", form.panelText);
    body.set("socialMode", form.socialMode);
    for (const id of form.socialProviders) body.append("socialProviders", id);
    if (logoFile && form.logoSource === "upload") body.set("logo", logoFile);
    if (panelFile) body.set("panelImage", panelFile);
    if (removePanel) body.set("removePanelImage", "1");
    setPending("save");
    try {
      const result = await saveAppBrandingAction(clientId, body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      for (const warning of result.warnings) onNotify(warning, "error");
      onNotify("Sign-in branding saved", "success");
      onOpenChange(false);
    } finally {
      setPending(null);
    }
  }

  async function reset() {
    setPending("reset");
    try {
      const result = await resetAppBrandingAction(clientId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onNotify("Sign-in branding reset", "success");
      onOpenChange(false);
    } finally {
      setPending(null);
    }
  }

  const id = (name: string) => `branding-${name}-${clientId}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Sign-in branding</DialogTitle>
          <DialogDescription>
            How the sign-in screens look when people arrive from{" "}
            <span className="font-medium text-foreground">{data?.clientName ?? clientId}</span>: login, sign-up,
            two-factor, password reset and consent. The {brand.name} mark stays visible on every screen.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-destructive text-sm" role="alert">
            {loadError}
          </p>
        ) : !form || !data ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : (
          <form onSubmit={(e) => void save(e)} className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor={id("name")}>Display name</FieldLabel>
                <Input
                  id={id("name")}
                  value={form.displayName}
                  maxLength={BRANDING_LIMITS.displayName}
                  placeholder={data.clientName}
                  onChange={(e) => update("displayName", e.target.value)}
                />
                <p className="text-muted-foreground text-xs">Shown as “Sign in to continue to …”. Empty uses the application name.</p>
              </Field>
              <Field>
                <FieldLabel htmlFor={id("tagline")}>Tagline (optional)</FieldLabel>
                <Input
                  id={id("tagline")}
                  value={form.tagline}
                  maxLength={BRANDING_LIMITS.tagline}
                  placeholder="Your reading list, everywhere."
                  onChange={(e) => update("tagline", e.target.value)}
                />
              </Field>

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
                    Accent color
                  </Label>
                </div>
                {form.accentEnabled ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label="Pick the accent color"
                        className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                        value={accent ?? "#000000"}
                        onChange={(e) => update("accentColor", e.target.value)}
                      />
                      <Input
                        id={id("accent")}
                        aria-label="Accent color (hex)"
                        value={form.accentColor}
                        className="w-32 font-mono"
                        aria-invalid={!accent}
                        onChange={(e) => update("accentColor", e.target.value)}
                      />
                    </div>
                    {palette ? (
                      <ul className="grid gap-1.5 text-xs" aria-label="Contrast checks">
                        <Ratio label={`Button label (${palette.foreground === "#000000" ? "black" : "white"})`} value={palette.foregroundContrast} min={AA_TEXT} />
                        <Ratio
                          label="Buttons on the light card"
                          value={palette.light.contrast}
                          min={AA_UI}
                          hint={palette.light.textAdjusted ? `Text in the accent uses ${palette.light.text} to reach ${AA_TEXT}:1.` : undefined}
                        />
                        <Ratio
                          label="Buttons on the dark card"
                          value={palette.dark.contrast}
                          min={AA_UI}
                          hint={palette.dark.textAdjusted ? `Text in the accent uses ${palette.dark.text} to reach ${AA_TEXT}:1.` : undefined}
                        />
                      </ul>
                    ) : (
                      <p className="text-destructive text-xs">Enter a hex color such as #2563eb.</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">Off: the screens keep the theme’s colors.</p>
                )}
              </Field>

              <Field>
                <FieldLabel>Logo</FieldLabel>
                <div role="radiogroup" aria-label="Logo source" className="flex flex-wrap gap-2">
                  {(
                    [
                      ["app_icon", "App icon"],
                      ["url", "From a URL"],
                      ["upload", "Upload"],
                    ] as const
                  ).map(([value, label]) => (
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
                      {label}
                    </label>
                  ))}
                </div>
                {form.logoSource === "app_icon" ? (
                  <p className="text-muted-foreground text-xs">The icon found for the app (its logo_uri or its site), as on the consent screen.</p>
                ) : null}
                {form.logoSource === "url" ? (
                  <>
                    <Input
                      aria-label="Logo URL"
                      value={form.logoUrl}
                      placeholder="https://cdn.example.com/logo.svg"
                      className="font-mono text-xs"
                      onChange={(e) => update("logoUrl", e.target.value)}
                    />
                    <p className="text-muted-foreground text-xs">
                      https on a public host. {brand.name} fetches and caches it; browsers never load it from there.
                    </p>
                  </>
                ) : null}
                {form.logoSource === "upload" ? (
                  <>
                    <Input
                      aria-label="Logo file"
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml,image/x-icon"
                      onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    />
                    <p className="text-muted-foreground text-xs">PNG, JPEG, WebP, AVIF, GIF, ICO or SVG, up to 256 KB. Square works best.</p>
                  </>
                ) : null}
                {logoNote ? <p className="text-muted-foreground text-xs">{logoNote}</p> : null}
              </Field>

              <Field>
                <FieldLabel htmlFor={id("panel-text")}>Side panel (wide screens, optional)</FieldLabel>
                <Textarea
                  id={id("panel-text")}
                  rows={2}
                  value={form.panelText}
                  maxLength={BRANDING_LIMITS.panelText}
                  placeholder={brand.tagline}
                  onChange={(e) => update("panelText", e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label="Side panel image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    className="max-w-xs"
                    onChange={(e) => {
                      setPanelFile(e.target.files?.[0] ?? null);
                      setRemovePanel(false);
                    }}
                  />
                  {(saved?.hasPanelImage || panelFile) && !removePanel ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPanelFile(null);
                        setRemovePanel(true);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">Headline and background image of the dark panel. PNG, JPEG, WebP or AVIF, up to 1 MB.</p>
              </Field>

              <Field>
                <FieldLabel>Social sign-in on this app’s screens</FieldLabel>
                {data.socialProviders.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No social providers are enabled.</p>
                ) : (
                  <>
                    <div role="radiogroup" aria-label="Social providers shown" className="flex flex-wrap gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={form.socialMode === "all"} onChange={() => update("socialMode", "all")} />
                        All enabled
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={form.socialMode === "some"} onChange={() => update("socialMode", "some")} />
                        Only these
                      </label>
                    </div>
                    {form.socialMode === "some" ? (
                      <div className="flex flex-wrap gap-3 text-sm">
                        {data.socialProviders.map((p) => (
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
                      Hides buttons on this app’s screens only; it does not stop anyone from signing in another way.
                    </p>
                  </>
                )}
              </Field>
            </FieldGroup>

            <div className="space-y-3 md:sticky md:top-0 md:self-start">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Preview</p>
                <div className="flex gap-1" role="group" aria-label="Preview color scheme">
                  <Button type="button" size="icon-sm" variant={darkPreview ? "ghost" : "secondary"} aria-label="Light" aria-pressed={!darkPreview} onClick={() => setDarkPreview(false)}>
                    <SunIcon />
                  </Button>
                  <Button type="button" size="icon-sm" variant={darkPreview ? "secondary" : "ghost"} aria-label="Dark" aria-pressed={darkPreview} onClick={() => setDarkPreview(true)}>
                    <MoonIcon />
                  </Button>
                </div>
              </div>
              <BrandingPreview
                dark={darkPreview}
                name={form.displayName.trim() || data.clientName}
                tagline={form.tagline.trim()}
                logoSrc={logoSrc}
                accent={accent}
                panelText={form.panelText.trim()}
                panelImage={panelSrc}
                socialProviders={previewProviders}
              />
              {palette?.warnings.length ? (
                <p role="note" className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                  <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                  Buttons in this color barely stand out from the {palette.warnings.includes("light_ui") ? "light" : "dark"} card (WCAG asks 3:1
                  for controls). Labels stay readable; consider a {palette.warnings.includes("light_ui") ? "darker" : "lighter"} shade.
                </p>
              ) : null}
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="ghost" disabled={pending !== null || !saved?.updatedAt} onClick={() => void reset()} className="me-auto">
                {pending === "reset" ? "Resetting…" : "Reset to default"}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending !== null}>
                {pending === "save" ? "Saving…" : "Save branding"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
