import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { Button } from "@ostiary/core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ostiary/core/components/ui/card";
import { currentAuthPolicy } from "@ostiary/core/lib/auth-policy";
import { passwordBreachPending } from "@ostiary/core/lib/security/password-breach";
import { TWO_FACTOR_PROMPT_PATH, twoFactorRequirement } from "@ostiary/core/lib/two-factor-policy";

import { AuthScreen } from "@/components/auth/auth-screen";
import { ContinueSignIn } from "@/components/auth/continue-sign-in";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { noIndexMetadata } from "@/lib/page-metadata";

export const generateMetadata = noIndexMetadata("auth.twoFactorRequired", "metaTitle", { follow: false });

/**
 * The OAuth provider's post-login page (auth-factory.ts, `postLogin`): an app sign-in stops here
 * when two-factor authentication is required and the account has none (two-factor-policy.ts).
 * During the grace period the person may go on to the app; after it, they turn it on first,
 * on the account page, which brings them back here to resume.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}/login`);
  // A password found in a breach is changed first; that page resumes the sign-in afterwards.
  if (await passwordBreachPending(session.user.id)) redirect(`/${locale}/change-password?${query.toString()}`);
  const t = await getTranslations({ locale, namespace: "auth.twoFactorRequired" });
  const requirement = await twoFactorRequirement(session.user, await currentAuthPolicy());

  if (!requirement.required) {
    // Turned on meanwhile (or no longer required): back to the app.
    return (
      <AuthScreen locale={locale} app={null} appIntent="continue">
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <ContinueSignIn label={t("continue")} auto variant="default" />
          </CardContent>
        </Card>
      </AuthScreen>
    );
  }

  const format = await getFormatter({ locale });
  const inGrace = requirement.deadline > new Date();
  const back = `/${locale}${TWO_FACTOR_PROMPT_PATH}?${query.toString()}`;
  return (
    <AuthScreen locale={locale} app={null} appIntent="continue">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {requirement.source === "organization" ? t("byOrganization") : t("byPlatform")}{" "}
            {inGrace ? t("until", { date: format.dateTime(requirement.deadline, { dateStyle: "long" }) }) : t("now")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">{t("how")}</p>
          <Button asChild>
            <Link href={`/dashboard/security?continue=${encodeURIComponent(back)}#two-factor`}>{t("setUp")}</Link>
          </Button>
          {inGrace ? <ContinueSignIn label={t("later")} /> : null}
        </CardContent>
      </Card>
    </AuthScreen>
  );
}
