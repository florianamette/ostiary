import { createNextConfig } from "../../packages/core/src/config/next-config";

export default createNextConfig({
  appDir: import.meta.dirname,
  imageRoutes: ["/api/admin/app-icon/:clientId", "/api/admin/app-branding/:clientId/:asset"],
  // Sign-in branding uploads (a 256 KB logo and a 1 MB side-panel image) go through a server action.
  // User imports are larger and have their own route, with its own limit (api/admin/users/import).
  serverActionsBodyLimit: "2mb",
});
