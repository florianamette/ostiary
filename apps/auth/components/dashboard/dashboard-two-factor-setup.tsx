"use client";

import { Copy, Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { renderSVG } from "uqr";

import { Button } from "@ostiary/core/components/ui/button";
import { brand } from "@ostiary/core/lib/brand";

/** The base32 secret of an otpauth:// URI. Throws if the URI does not parse. */
function totpSecret(totpURI: string): string {
  return new URL(totpURI).searchParams.get("secret") ?? "";
}

/** The secret in groups of four, for typing by hand. */
function manualKey(totpURI: string): string {
  try {
    return totpSecret(totpURI).replace(/(.{4})/g, "$1 ").trim();
  } catch {
    return "";
  }
}

function qrDataUrl(text: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(text, { border: 2 }))}`;
}

export function BackupCodes({ codes }: { codes: string[] }) {
  const t = useTranslations("dashboard.twoFactor");

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success(t("copied"));
    } catch {
      toast.error(t("errors.generic"));
    }
  }

  function download() {
    const text = `${t("fileTitle", { name: brand.name })}\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brand.name.toLowerCase()}-backup-codes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-border bg-muted/40 p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          <Copy className="size-4" aria-hidden />
          {t("copy")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Download className="size-4" aria-hidden />
          {t("download")}
        </Button>
      </div>
    </div>
  );
}

/** The new authenticator secret: QR code, key to type by hand, and a link for this device. */
export function AuthenticatorSetup({ totpURI }: { totpURI: string }) {
  const t = useTranslations("dashboard.twoFactor");

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(totpSecret(totpURI));
      toast.success(t("keyCopied"));
    } catch {
      toast.error(t("errors.generic"));
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {/* White ground in both themes: scanners need dark modules on light. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <img
        src={qrDataUrl(totpURI)}
        alt={t("qrAlt")}
        width={176}
        height={176}
        className="size-44 rounded-md bg-white p-1"
      />
      <div className="w-full space-y-1 text-center">
        <p className="text-xs text-muted-foreground">{t("manualKey")}</p>
        <p className="break-all font-mono text-sm select-all">{manualKey(totpURI)}</p>
      </div>
      {/* On a phone the QR code is on the same screen: open the otpauth:// link instead
          (Apple Passwords, 1Password, Google and Microsoft Authenticator handle it). */}
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={totpURI}>
            <ExternalLink className="size-4" aria-hidden />
            {t("openInApp")}
          </a>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void copyKey()}>
          <Copy className="size-4" aria-hidden />
          {t("copy")}
        </Button>
      </div>
    </div>
  );
}
