import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/*
 * SCIM 2.0 provisioning (@better-auth/scim). Field for field the plugin's models, as its
 * schema generator writes them. The plugin owns these tables: Ostiary reads a few of them
 * (connections, credentials, provisioned users) for the admin console and writes none.
 *
 * Each organization gets one managed connection whose provisioning domain is the
 * organization id. Its bearer tokens are stored as HMAC digests, never in clear.
 */

/** One SCIM connection per organization, created from the admin console. */
export const scimManagedConnection = pgTable(
  "scim_managed_connection",
  {
    id: text("id").primaryKey(),
    creationRequestId: text("creation_request_id").notNull().unique(),
    connectionId: text("connection_id").notNull().unique(),
    /** The organization id. */
    provisioningDomainId: text("provisioning_domain_id").notNull(),
    status: text("status").notNull(),
    revision: integer("revision").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").notNull(),
    decommissionStartedAt: timestamp("decommission_started_at"),
    decommissionStartedBy: text("decommission_started_by"),
    decommissionedAt: timestamp("decommissioned_at"),
    decommissionedBy: text("decommissioned_by"),
  },
  (table) => [index("scimManagedConnection_provisioningDomainId_idx").on(table.provisioningDomainId)],
);

/** Bearer tokens of a connection (digest only), with expiry and revocation. */
export const scimManagedCredential = pgTable(
  "scim_managed_credential",
  {
    id: text("id").primaryKey(),
    connectionRecordId: text("connection_record_id")
      .notNull()
      .references(() => scimManagedConnection.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(),
    tokenDigest: text("token_digest").notNull(),
    hashVersion: text("hash_version").notNull(),
    activeSlotKey: text("active_slot_key").notNull().unique(),
    status: text("status").notNull(),
    serializedScopes: text("serialized_scopes").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    createdBy: text("created_by").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    revokedBy: text("revoked_by"),
    decommissionedAt: timestamp("decommissioned_at"),
  },
  (table) => [index("scimManagedCredential_connectionRecordId_idx").on(table.connectionRecordId)],
);

export const scimManagedConnectionEvent = pgTable(
  "scim_managed_connection_event",
  {
    id: text("id").primaryKey(),
    connectionRecordId: text("connection_record_id")
      .notNull()
      .references(() => scimManagedConnection.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull().unique(),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    actorId: text("actor_id").notNull(),
    credentialId: text("credential_id"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("scimManagedConnectionEvent_connectionRecordId_idx").on(table.connectionRecordId)],
);

export const scimConnectionBinding = pgTable(
  "scim_connection_binding",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    connectionKey: text("connection_key").notNull().unique(),
    provisioningDomainId: text("provisioning_domain_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
    decommissionedAt: timestamp("decommissioned_at"),
    decommissionStatus: text("decommission_status").default("active").notNull(),
    decommissionCursorUserId: text("decommission_cursor_user_id"),
    decommissionReconciledUserCount: integer("decommission_reconciled_user_count").default(0).notNull(),
    decommissionBatchCount: integer("decommission_batch_count").default(0).notNull(),
    decommissionRevision: integer("decommission_revision").default(0).notNull(),
    decommissionCompletedAt: timestamp("decommission_completed_at"),
    decommissionLeaseId: text("decommission_lease_id"),
    decommissionLeaseExpiresAt: timestamp("decommission_lease_expires_at"),
  },
  (table) => [index("scimConnectionBinding_connectionId_idx").on(table.connectionId)],
);

/** Kept when the identity provider deletes a user, so re-provisioning finds the same account. */
export const scimIdentityTombstone = pgTable(
  "scim_identity_tombstone",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    provisioningDomainId: text("provisioning_domain_id").notNull(),
    externalId: text("external_id").notNull(),
    externalIdKey: text("external_id_key").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    profile: text("profile").notNull(),
    deletedAt: timestamp("deleted_at").notNull(),
  },
  (table) => [
    index("scimIdentityTombstone_connectionId_idx").on(table.connectionId),
    index("scimIdentityTombstone_provisioningDomainId_idx").on(table.provisioningDomainId),
    index("scimIdentityTombstone_userId_idx").on(table.userId),
  ],
);

/** One row per account that any SCIM connection provisions. */
export const scimSubject = pgTable(
  "scim_subject",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    profileSourceId: text("profile_source_id"),
    revision: integer("revision").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("scimSubject_profileSourceId_idx").on(table.profileSourceId)],
);

/** A SCIM User resource as the identity provider sent it, linked to an Ostiary account. */
export const scimUser = pgTable(
  "scim_user",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    provisioningDomainId: text("provisioning_domain_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionUserKey: text("connection_user_key").notNull().unique(),
    userName: text("user_name").notNull(),
    userNameKey: text("user_name_key").notNull().unique(),
    primaryEmail: text("primary_email").notNull(),
    workEmailValueIndex: text("work_email_value_index").notNull(),
    emailValueIndex: text("email_value_index").notNull(),
    displayName: text("display_name").notNull(),
    formattedName: text("formatted_name").notNull(),
    givenName: text("given_name"),
    familyName: text("family_name"),
    serializedEmails: text("serialized_emails").notNull(),
    serializedAttributes: text("serialized_attributes"),
    externalId: text("external_id"),
    externalIdKey: text("external_id_key").unique(),
    active: boolean("active").notNull(),
    orderKey: text("order_key").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("scimUser_connectionId_idx").on(table.connectionId),
    index("scimUser_provisioningDomainId_idx").on(table.provisioningDomainId),
    index("scimUser_userId_idx").on(table.userId),
  ],
);

export const scimProjectionGrant = pgTable(
  "scim_projection_grant",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    provisioningDomainId: text("provisioning_domain_id").notNull(),
    scimUserId: text("scim_user_id")
      .notNull()
      .references(() => scimUser.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id").notNull(),
    sourceValue: text("source_value"),
    role: text("role").notNull(),
    grantKey: text("grant_key").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("scimProjectionGrant_connectionId_idx").on(table.connectionId),
    index("scimProjectionGrant_provisioningDomainId_idx").on(table.provisioningDomainId),
    index("scimProjectionGrant_scimUserId_idx").on(table.scimUserId),
    index("scimProjectionGrant_userId_idx").on(table.userId),
  ],
);

export const scimGroup = pgTable(
  "scim_group",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    provisioningDomainId: text("provisioning_domain_id").notNull(),
    revision: integer("revision").default(0).notNull(),
    displayName: text("display_name").notNull(),
    displayNameKey: text("display_name_key").notNull().unique(),
    externalId: text("external_id"),
    externalIdKey: text("external_id_key").unique(),
    orderKey: text("order_key").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("scimGroup_connectionId_idx").on(table.connectionId),
    index("scimGroup_provisioningDomainId_idx").on(table.provisioningDomainId),
  ],
);

export const scimGroupMember = pgTable(
  "scim_group_member",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    groupId: text("group_id")
      .notNull()
      .references(() => scimGroup.id, { onDelete: "cascade" }),
    scimUserId: text("scim_user_id")
      .notNull()
      .references(() => scimUser.id, { onDelete: "cascade" }),
    membershipKey: text("membership_key").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("scimGroupMember_connectionId_idx").on(table.connectionId),
    index("scimGroupMember_groupId_idx").on(table.groupId),
    index("scimGroupMember_scimUserId_idx").on(table.scimUserId),
  ],
);
