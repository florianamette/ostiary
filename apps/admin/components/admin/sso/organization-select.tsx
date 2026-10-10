"use client";

import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ostiary/core/components/ui/select";

export type Org = { id: string; name: string };

/** The select value for "no organization". */
export const NO_ORG = "__none__";

/** The organization an SSO provider belongs to, or none. */
export function OrganizationSelect({ id, value, onChange, organizations, disabled }: { id: string; value: string; onChange: (v: string) => void; organizations: Org[]; disabled?: boolean }) {
  const t = useTranslations("sso.panel");
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_ORG}>{t("noOrganization")}</SelectItem>
        {organizations.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
