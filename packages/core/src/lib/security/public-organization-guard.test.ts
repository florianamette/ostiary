import { describe, expect, it } from "vitest";

import { PUBLIC_ORGANIZATION_ID, PUBLIC_ORGANIZATION_SLUG } from "@ostiary/core/lib/organization-public";
import { publicOrganizationRequestRefused } from "@ostiary/core/lib/security/public-organization-guard";

const member = { isPlatformAdmin: false, activeOrganizationId: PUBLIC_ORGANIZATION_ID };

describe("publicOrganizationRequestRefused", () => {
  it("refuses member and invitation listings of the Public organization", () => {
    for (const path of ["/organization/list-members", "/organization/get-full-organization", "/organization/list-invitations", "/organization/list-teams"]) {
      expect(publicOrganizationRequestRefused(path, {}, member), path).toBe(true);
      expect(publicOrganizationRequestRefused(path, { organizationId: PUBLIC_ORGANIZATION_ID }, { ...member, activeOrganizationId: "org_acme" }), path).toBe(true);
      expect(publicOrganizationRequestRefused(path, { organizationSlug: PUBLIC_ORGANIZATION_SLUG }, { ...member, activeOrganizationId: null }), path).toBe(true);
    }
  });

  it("refuses member changes in the Public organization", () => {
    for (const path of ["/organization/invite-member", "/organization/remove-member", "/organization/update-member-role", "/organization/update", "/organization/delete"]) {
      expect(publicOrganizationRequestRefused(path, {}, member), path).toBe(true);
    }
  });

  it("refuses reading another member's role there", () => {
    expect(publicOrganizationRequestRefused("/organization/get-active-member-role", { userId: "usr_other" }, member)).toBe(true);
    expect(publicOrganizationRequestRefused("/organization/get-active-member-role", {}, member)).toBe(false);
  });

  it("lets platform admins manage it", () => {
    expect(publicOrganizationRequestRefused("/organization/list-members", {}, { ...member, isPlatformAdmin: true })).toBe(false);
  });

  it("leaves other organizations and the person's own data alone", () => {
    expect(publicOrganizationRequestRefused("/organization/list-members", { organizationId: "org_acme" }, member)).toBe(false);
    expect(publicOrganizationRequestRefused("/organization/list-members", {}, { ...member, activeOrganizationId: "org_acme" })).toBe(false);
    for (const path of ["/organization/list", "/organization/set-active", "/organization/get-active-member", "/organization/list-user-invitations", "/organization/accept-invitation"]) {
      expect(publicOrganizationRequestRefused(path, {}, member), path).toBe(false);
    }
  });
});
