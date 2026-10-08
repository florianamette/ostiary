import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { brand } from "@ostiary/core/lib/brand";
import { env } from "@ostiary/core/lib/env";
import { listSigningKeys, loadSigningKeySettings } from "@ostiary/core/lib/signing-keys";
import { describeSigningKeys } from "@ostiary/core/lib/signing-keys-policy";

import { PageHeader } from "@/components/admin/common/page-header";
import { SigningKeysPanel } from "@/components/admin/signing-keys/signing-keys-panel";
import { requireAdminSession } from "@/lib/require-admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.signingKeys" });
  return { title: t("title"), description: t("description", { name: brand.name }) };
}

export default async function SigningKeysPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminSession();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.pages.signingKeys" });
  const [settings, rows] = await Promise.all([loadSigningKeySettings(), listSigningKeys()]);
  // Public metadata only: listSigningKeys never reads the private keys.
  const keys = describeSigningKeys(rows, settings).map((key) => ({
    id: key.id,
    alg: key.alg,
    crv: key.crv,
    status: key.status,
    createdAt: key.createdAt.toISOString(),
    expiresAt: key.expiresAt?.toISOString() ?? null,
    unpublishedAt: key.unpublishedAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description", { name: brand.name })} />
      <SigningKeysPanel
        settings={settings}
        keys={keys}
        jwksUrl={env.AUTH_APP_URL ? `${env.AUTH_APP_URL}/api/auth/jwks` : ""}
      />
    </div>
  );
}
