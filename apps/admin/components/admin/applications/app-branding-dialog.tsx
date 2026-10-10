"use client";

import * as React from "react";
import { AlertTriangleIcon, Loader2Icon, MoonIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";

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
import { Textarea } from "@ostiary/core/components/ui/textarea";
import { accentPalette, normalizeHexColor } from "@ostiary/core/lib/app-branding/color";
import { BRANDING_LIMITS } from "@ostiary/core/lib/app-branding/validation";
import type { AppBrandingSettings } from "@ostiary/core/lib/app-branding/store";
import { brand } from "@ostiary/core/lib/brand";
import { adminNotify } from "@ostiary/core/lib/admin/admin-notify";
import {
  loadAppBranding,
  resetAppBrandingAction,
  saveAppBrandingAction,
  type BrandingDialogData,
} from "@/app/[locale]/(console)/applications/branding-actions";
import {
  AccentField,
  LogoField,
  SocialProvidersField,
  type BrandingFormState,
} from "@/components/admin/applications/app-branding-fields";
import { BrandingPreview } from "@/components/admin/applications/app-branding-preview";
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

function toForm(settings: AppBrandingSettings): BrandingFormState {
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

/** The body `saveAppBrandingAction` reads. */
function toFormData(
  form: BrandingFormState,
  files: { logoFile: File | null; panelFile: File | null; removePanel: boolean },
): FormData {
  const body = new FormData();
  body.set("displayName", form.displayName);
  body.set("tagline", form.tagline);
  body.set("accentColor", form.accentEnabled ? form.accentColor : "");
  body.set("logoSource", form.logoSource);
  body.set("logoUrl", form.logoUrl);
  body.set("panelText", form.panelText);
  body.set("socialMode", form.socialMode);
  for (const id of form.socialProviders) body.append("socialProviders", id);
  if (files.logoFile && form.logoSource === "upload") body.set("logo", files.logoFile);
  if (files.panelFile) body.set("panelImage", files.panelFile);
  if (files.removePanel) body.set("removePanelImage", "1");
  return body;
}

export function AppBrandingDialog({
  clientId,
  open,
  onOpenChange,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.pages.applications.branding");
  const tScreen = useTranslations("auth.screen");
  const tCommon = useTranslations("admin.common");
  const [data, setData] = React.useState<BrandingDialogData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<BrandingFormState | null>(null);
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

  const update = <K extends keyof BrandingFormState>(key: K, value: BrandingFormState[K]) =>
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
      if (!unchanged) logoNote = t("logoFetchedOnSave");
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
      setError(t("accentInvalid", { example: "#2563eb" }));
      return;
    }
    const body = toFormData(form, { logoFile, panelFile, removePanel });
    setPending("save");
    try {
      const result = await saveAppBrandingAction(clientId, body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      for (const warning of result.warnings) adminNotify(warning, "error");
      adminNotify(t("saved"), "success");
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
      adminNotify(t("resetDone"), "success");
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
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t.rich("description", {
              client: data?.clientName ?? clientId,
              brand: brand.name,
              app: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-destructive text-sm" role="alert">
            {loadError}
          </p>
        ) : !form || !data ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden /> {tCommon("loading")}
          </div>
        ) : (
          <form onSubmit={(e) => void save(e)} className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor={id("name")}>{t("displayName")}</FieldLabel>
                <Input
                  id={id("name")}
                  value={form.displayName}
                  maxLength={BRANDING_LIMITS.displayName}
                  placeholder={data.clientName}
                  onChange={(e) => update("displayName", e.target.value)}
                />
                <p className="text-muted-foreground text-xs">{t("displayNameHint")}</p>
              </Field>
              <Field>
                <FieldLabel htmlFor={id("tagline")}>{t("tagline")}</FieldLabel>
                <Input
                  id={id("tagline")}
                  value={form.tagline}
                  maxLength={BRANDING_LIMITS.tagline}
                  placeholder={t("taglinePlaceholder")}
                  onChange={(e) => update("tagline", e.target.value)}
                />
              </Field>

              <AccentField form={form} update={update} accent={accent} palette={palette} id={id} />

              <LogoField form={form} update={update} onLogoFile={setLogoFile} logoNote={logoNote} id={id} />

              <Field>
                <FieldLabel htmlFor={id("panel-text")}>{t("panel")}</FieldLabel>
                <Textarea
                  id={id("panel-text")}
                  rows={2}
                  value={form.panelText}
                  maxLength={BRANDING_LIMITS.panelText}
                  placeholder={tScreen.markup("headline", { accent: (chunks) => chunks })}
                  onChange={(e) => update("panelText", e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={t("panelImage")}
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
                      {t("removeImage")}
                    </Button>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">{t("panelHint")}</p>
              </Field>

              <SocialProvidersField form={form} update={update} providers={data.socialProviders} />
            </FieldGroup>

            <div className="space-y-3 md:sticky md:top-0 md:self-start">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t("previewTitle")}</p>
                <div className="flex gap-1" role="group" aria-label={t("previewScheme")}>
                  <Button type="button" size="icon-sm" variant={darkPreview ? "ghost" : "secondary"} aria-label={t("light")} aria-pressed={!darkPreview} onClick={() => setDarkPreview(false)}>
                    <SunIcon />
                  </Button>
                  <Button type="button" size="icon-sm" variant={darkPreview ? "secondary" : "ghost"} aria-label={t("dark")} aria-pressed={darkPreview} onClick={() => setDarkPreview(true)}>
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
                  {palette.warnings.includes("light_ui") ? t("faintOnLight") : t("faintOnDark")}
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
                {pending === "reset" ? t("resetting") : t("reset")}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending !== null}>
                {pending === "save" ? tCommon("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
