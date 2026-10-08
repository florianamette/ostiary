"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { cn } from "@ostiary/core/lib/utils";
import { ShieldAlertIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

type PublicClient = {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  policy_uri?: string;
  tos_uri?: string;
};

/** Set for a client that registered itself, see the consent page. */
export type ConsentClientOrigin = {
  source: "dynamic" | "metadata_document";
  /** Host of the client_id URL, for a metadata-document client. */
  documentHost: string | null;
  /** Host of the redirect URI the user is sent to after answering. */
  redirectHost: string | null;
};

export function ConsentForm({
  className,
  origin = null,
  ...props
}: React.ComponentProps<"div"> & { origin?: ConsentClientOrigin | null }) {
  const t = useTranslations("consent");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id");
  const scopeParam = searchParams.get("scope") ?? "";
  const scopes = useMemo(
    () => scopeParam.split(/\s+/).filter(Boolean),
    [scopeParam],
  );

  const [client, setClient] = useState<PublicClient | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNeedsSignIn, setLoadNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const consentReturnPath = useMemo(() => {
    const q = searchParams.toString();
    return q ? `/consent?${q}` : "/consent";
  }, [searchParams]);

  useEffect(() => {
    if (!clientId) {
      setLoadError(null);
      setLoadNeedsSignIn(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadError(null);
      setLoadNeedsSignIn(false);
      const { data, error } = await authClient.$fetch(
        `/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
        { method: "GET" },
      );
      if (cancelled) return;
      if (error) {
        if (error.status === 401) {
          setLoadNeedsSignIn(true);
          setLoadError(t("errors.needSignIn"));
        } else {
          setLoadError(error.message ?? t("errors.loadFailed"));
        }
        setClient(null);
        return;
      }
      setClient(data as PublicClient);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, t]);

  const submit = useCallback(
    async (accept: boolean) => {
      setActionError(null);
      setBusy(true);
      try {
        const { error } = await authClient.$fetch("/oauth2/consent", {
          method: "POST",
          body: { accept },
        });
        if (error) {
          setActionError(error.message ?? t("errors.actionFailed"));
        }
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const scopeDescription = useCallback(
    (scope: string) => {
      const key = `scopes.${scope}`;
      if (t.has(key)) {
        return t(key);
      }
      return null;
    },
    [t],
  );

  if (!clientId) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyDescription")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const displayName = client?.client_name ?? clientId;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-start gap-4">
            {/* A self-registered client's logo is not shown: it could imitate a trusted app,
                and loading it would tell that client's host who is signing in. */}
            {client?.logo_uri && !origin ? (
              // OAuth `logo_uri` can point to any HTTPS URL from client registration.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={client.logo_uri}
                alt=""
                width={48}
                height={48}
                className="size-12 shrink-0 rounded-md border border-border object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-xl leading-snug">
                {t("connectTitle", { name: displayName })}
              </CardTitle>
              <CardDescription>{t("intro")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {loadError ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <p>{loadError}</p>
              {loadNeedsSignIn ? (
                <Button className="mt-3" variant="secondary" size="sm" asChild>
                  <Link
                    href={`/login?callbackURL=${encodeURIComponent(consentReturnPath)}`}
                  >
                    {t("signIn")}
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          {!loadError && !client ? (
            <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
          ) : null}

          {client && origin ? (
            <div
              role="note"
              className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100"
            >
              <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{t("unverified.title")}</p>
                <p>
                  {origin.source === "metadata_document" && origin.documentHost
                    ? t("unverified.metadataDocument", { host: origin.documentHost })
                    : t("unverified.dynamic")}
                </p>
                {origin.redirectHost ? (
                  <p className="break-all">
                    {t.rich("unverified.redirect", {
                      host: origin.redirectHost,
                      strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {client ? (
            <>
              {client.client_uri ? (
                <p className="text-sm text-muted-foreground">
                  <a
                    href={client.client_uri}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {t("visitWebsite")}
                  </a>
                </p>
              ) : null}

              <div>
                <h3 className="mb-2 text-sm font-medium">
                  {t("requestedAccess")}
                </h3>
                {scopes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("defaultScopes")}
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {scopes.map((scope) => (
                      <li
                        key={scope}
                        className="rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <span className="font-mono text-xs text-foreground">
                          {scope}
                        </span>
                        {scopeDescription(scope) ? (
                          <p className="mt-1 text-muted-foreground">
                            {scopeDescription(scope)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(client.policy_uri || client.tos_uri) && (
                <p className="text-xs text-muted-foreground">
                  {client.tos_uri ? (
                    <a
                      href={client.tos_uri}
                      className="underline-offset-4 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("terms")}
                    </a>
                  ) : null}
                  {client.policy_uri && client.tos_uri ? " · " : null}
                  {client.policy_uri ? (
                    <a
                      href={client.policy_uri}
                      className="underline-offset-4 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("privacy")}
                    </a>
                  ) : null}
                </p>
              )}

              {actionError ? (
                <p className="text-sm text-destructive">{actionError}</p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => submit(false)}
                >
                  {t("deny")}
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => submit(true)}
                >
                  {t("allow")}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
