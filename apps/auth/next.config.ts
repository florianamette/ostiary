import { createNextConfig } from "../../packages/core/src/config/next-config";

export default createNextConfig({
  appDir: import.meta.dirname,
  imageRoutes: ["/api/app-icon/:clientId", "/api/app-branding/:clientId/:asset"],
  captchaProvider: process.env.CAPTCHA_PROVIDER,
});
