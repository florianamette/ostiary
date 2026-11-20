import { createNextConfig } from "../../packages/core/src/config/next-config";

export default createNextConfig({
  appDir: import.meta.dirname,
  imageRoutes: ["/api/admin/app-icon/:clientId", "/api/admin/app-branding/:clientId/:asset"],
  // Server actions with uploads: sign-in branding (a 256 KB logo and a 1 MB side-panel image)
  // and user imports (10 MB of files, MAX_IMPORT_BYTES, plus the multipart overhead).
  serverActionsBodyLimit: "11mb",
});
