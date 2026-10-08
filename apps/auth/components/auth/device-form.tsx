"use client";

import { CheckCircle2Icon, MonitorSmartphoneIcon, XCircleIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@ostiary/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { formatUserCode, normalizeUserCode, USER_CODE_LENGTH } from "@ostiary/core/lib/device-code";
import { rateLimitMessage } from "@ostiary/core/lib/rate-limit-message";

type PublicClient = {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
};

/** `GET /device`: client and scopes are only returned to the user the code is bound to. */
type DeviceRequest = {
  user_code: string;
  status: "pending" | "approved" | "denied";
  client_id?: string;
  scope?: string;
};

type ErrorKey = "invalid" | "expired" | "processed" | "otherAccount" | "tooManyAttempts" | "failed";

/** `limited`: the rate limiter's "try again in …" message, shown instead of the key's text. */
type State =
  | { step: "enter"; error?: ErrorKey; limited?: string | null }
  | { step: "loading" }
  | { step: "review"; request: DeviceRequest; client: PublicClient | null }
  | { step: "done"; approved: boolean };

/** Maps a Better Auth device error (RFC 8628 codes in the body) to a message key. */
function errorKey(error: { status?: number; error?: unknown; error_description?: unknown; message?: unknown }): ErrorKey {
  if (error.status === 429) return "tooManyAttempts";
  if (error.error === "expired_token") return "expired";
  const description = String(error.error_description ?? error.message ?? "");
  if (/already processed/i.test(description)) return "processed";
  if (error.error === "invalid_request" && /invalid user code/i.test(description)) return "invalid";
  if (error.status === 403) return "otherAccount";
  return "failed";
}

/**
 * RFC 8628 verification page. The device (a CLI, a TV) shows a code; the signed-in user enters it
 * here, or arrives with it in `?user_code=`, sees which app asks for which scopes, and approves or
 * denies. Opening a code binds it to the current user, so nobody else can approve it.
 */
export function DeviceForm() {
  const t = useTranslations("device");
  const tConsent = useTranslations("consent");
  const tLimit = useTranslations("rateLimit");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCode = normalizeUserCode(searchParams.get("user_code") ?? "");
  const { data: session } = authClient.useSession();

  // The lookup result for one attempt; a new code, or the same one submitted again, is a new attempt.
  const [attempt, setAttempt] = useState(0);
  const attemptKey = `${userCode}#${attempt}`;
  const [outcome, setOutcome] = useState<{ key: string; state: State } | null>(null);
  const state: State = !userCode
    ? { step: "enter" }
    : outcome?.key === attemptKey
      ? outcome.state
      : { step: "loading" };
  const setState = useCallback(
    (next: State) => setOutcome({ key: attemptKey, state: next }),
    [attemptKey],
  );
  const [input, setInput] = useState(formatUserCode(userCode));
  const [busy, setBusy] = useState<"approve" | "deny" | "switch" | null>(null);
  const [actionError, setActionError] = useState<{ key: ErrorKey; limited: string | null } | null>(null);

  useEffect(() => {
    if (!userCode) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await authClient.$fetch<DeviceRequest>("/device", {
        method: "GET",
        query: { user_code: userCode },
      });
      if (cancelled) return;
      if (error || !data) {
        setState({
          step: "enter",
          error: error ? errorKey(error) : "failed",
          limited: rateLimitMessage(error, tLimit),
        });
        return;
      }
      if (data.status !== "pending") {
        setState({ step: "enter", error: "processed" });
        return;
      }
      if (!data.client_id) {
        setState({ step: "enter", error: "otherAccount" });
        return;
      }
      const res = await authClient.$fetch<PublicClient>(
        `/oauth2/public-client?client_id=${encodeURIComponent(data.client_id)}`,
        { method: "GET" },
      );
      if (cancelled) return;
      setState({ step: "review", request: data, client: res.data ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, [userCode, setState, tLimit]);

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeUserCode(input);
    if (!code) return;
    if (code === userCode) setAttempt((n) => n + 1);
    else router.replace(`/device?user_code=${encodeURIComponent(code)}`);
  }

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setActionError(null);
    const { error } = await authClient.$fetch(approve ? "/device/approve" : "/device/deny", {
      method: "POST",
      body: { userCode },
    });
    setBusy(null);
    if (error) {
      setActionError({ key: errorKey(error), limited: rateLimitMessage(error, tLimit) });
      return;
    }
    setState({ step: "done", approved: approve });
  }

  async function switchAccount() {
    setBusy("switch");
    await authClient.signOut();
    const back = `/${locale}/device?user_code=${encodeURIComponent(userCode)}`;
    router.push(`/login?callbackURL=${encodeURIComponent(back)}`);
  }

  function enterAnotherCode() {
    setInput("");
    setActionError(null);
    router.replace("/device");
  }

  if (state.step === "loading") {
    return <div className="h-80 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />;
  }

  if (state.step === "done") {
    const Icon = state.approved ? CheckCircle2Icon : XCircleIcon;
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Icon
            aria-hidden
            className={state.approved ? "mx-auto mb-2 size-10 text-brass" : "mx-auto mb-2 size-10 text-muted-foreground"}
          />
          <CardTitle>{state.approved ? t("approvedTitle") : t("deniedTitle")}</CardTitle>
          <CardDescription>
            {state.approved ? t("approvedDescription") : t("deniedDescription")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state.step === "enter") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <MonitorSmartphoneIcon aria-hidden className="mb-2 size-8 text-brass" />
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitCode}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="device-user-code">{t("codeLabel")}</FieldLabel>
                <Input
                  id="device-user-code"
                  name="user_code"
                  value={input}
                  onChange={(e) => setInput(formatUserCode(normalizeUserCode(e.target.value)))}
                  placeholder="ABCD-EFGH"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  maxLength={9}
                  aria-invalid={state.error ? true : undefined}
                  aria-describedby={state.error ? "device-user-code-error" : undefined}
                  className="h-14 text-center font-mono text-2xl tracking-[0.3em] uppercase md:text-2xl"
                />
                {state.error ? (
                  <p id="device-user-code-error" role="alert" className="text-sm text-destructive">
                    {state.limited ?? t(`errors.${state.error}`)}
                  </p>
                ) : null}
              </Field>
              <Button type="submit" disabled={normalizeUserCode(input).length < USER_CODE_LENGTH}>
                {t("continue")}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    );
  }

  const { client, request } = state;
  const scopes = (request.scope ?? "").split(/\s+/).filter(Boolean);
  const displayName = client?.client_name || request.client_id || "";
  const user = session?.user;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-4">
        <div className="flex items-start gap-4">
          {client?.logo_uri ? (
            // OAuth `logo_uri` can point to any HTTPS URL from client registration.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logo_uri}
              alt=""
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-lg font-semibold"
            >
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-xl leading-snug break-words">
              {t("reviewTitle", { name: displayName })}
            </CardTitle>
            <CardDescription>{t("reviewDescription")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-dashed border-brass/50 bg-brass/5 px-4 py-3">
          <span className="text-sm text-muted-foreground">{t("codeOnDevice")}</span>
          <span className="font-mono text-lg font-semibold tracking-[0.2em] whitespace-nowrap">
            {formatUserCode(userCode)}
          </span>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">{tConsent("requestedAccess")}</h3>
          {scopes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noScopes")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {scopes.map((scope) => (
                <li key={scope} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="font-mono text-xs text-foreground">{scope}</span>
                  {tConsent.has(`scopes.${scope}`) ? (
                    <p className="mt-1 text-muted-foreground">{tConsent(`scopes.${scope}`)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {user ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              {t("signedInAs", { email: user.email })}
            </span>
            <button
              type="button"
              onClick={switchAccount}
              disabled={busy !== null}
              className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              {t("switchAccount")}
            </button>
          </div>
        ) : null}

        {actionError ? (
          <p role="alert" className="text-sm text-destructive">
            {actionError.limited ?? t(`errors.${actionError.key}`)}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => decide(false)}>
            {t("deny")}
          </Button>
          <Button type="button" disabled={busy !== null} onClick={() => decide(true)}>
            {t("approve")}
          </Button>
        </div>
        <button
          type="button"
          onClick={enterAnotherCode}
          className="self-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("useAnotherCode")}
        </button>
      </CardContent>
    </Card>
  );
}
