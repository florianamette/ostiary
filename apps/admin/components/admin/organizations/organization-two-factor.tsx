"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { setOrganizationTwoFactorAction } from "@/app/[locale]/(console)/organizations/[id]/actions";
import { CheckboxField } from "@/components/admin/common/choice-field";
import { useAdminAction } from "@/components/admin/common/use-admin-action";

/** Two-factor authentication required for the organization's members (two-factor-policy.ts). */
export function OrganizationTwoFactor({ orgId, required }: { orgId: string; required: boolean }) {
  const t = useTranslations("admin.pages.organizations.detail.twoFactor");
  const { busy, run } = useAdminAction();
  // Shown at once; back to the stored value if the save fails.
  const [checked, setChecked] = React.useState(required);
  React.useEffect(() => setChecked(required), [required]);
  return (
    <CheckboxField
      id="org-require-two-factor"
      checked={checked}
      disabled={busy}
      onChange={(next) => {
        setChecked(next);
        void run(() => setOrganizationTwoFactorAction(orgId, next), next ? t("on") : t("off")).then((ok) => {
          if (!ok) setChecked(!next);
        });
      }}
      label={t("label")}
      hint={t("hint")}
    />
  );
}
