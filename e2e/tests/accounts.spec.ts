import { createUser, enableTotp, expectSignedInAs, loginViaUi, newUser, signInWithPassword } from "../support/auth";
import { expect, test } from "../support/fixtures";
import { waitForEmail } from "../support/mail";
import { freshTotp } from "../support/totp";

/* Sign-up, email verification, password and code sign-ins, two-factor authentication, rate limits. */

test("sign up, verify the email and sign in with the password", async ({ page, browser, clientIp }) => {
  const user = newUser("signup");
  const since = Date.now() - 1000;

  await page.goto("/en/signup");
  await page.getByRole("textbox", { name: "Full Name" }).fill(user.name);
  await page.getByRole("textbox", { name: "Username" }).fill(user.username);
  await page.getByRole("textbox", { name: "Email" }).fill(user.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(user.password);
  await page.getByRole("textbox", { name: "Confirm Password" }).fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();

  // Not signed in before the email is verified.
  const mail = await waitForEmail(user.email, "verification", since);
  const before = await page.request.get("/api/auth/get-session");
  expect(await before.json()).toBeNull();
  const refused = await signInWithPassword(page.request, user.email, user.password);
  expect(refused.status()).toBe(403);

  // The link verifies the address and signs in.
  await page.goto(mail.url!);
  await page.goto("/en/dashboard");
  await expect(page.getByText(user.email).first()).toBeVisible();

  // A new browser: password sign-in on the login page.
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": clientIp } });
  const other = await context.newPage();
  await loginViaUi(other, user.email, user.password);
  await other.waitForURL(/\/dashboard/);
  await expectSignedInAs(other.request, user.email);
  await context.close();
});

test("sign in with an emailed code", async ({ api, newApi }) => {
  const user = await createUser(api, "otp");
  const fresh = await newApi();
  const since = Date.now() - 1000;
  const send = await fresh.post("/api/auth/email-otp/send-verification-otp", { data: { email: user.email, type: "sign-in" } });
  expect(send.status(), await send.text()).toBe(200);
  const { code } = await waitForEmail(user.email, "sign-in", since);
  expect(code).toMatch(/^\d{6}$/);

  const wrong = await fresh.post("/api/auth/sign-in/email-otp", { data: { email: user.email, otp: code === "000000" ? "111111" : "000000" } });
  expect(wrong.status()).toBe(400);
  const signIn = await fresh.post("/api/auth/sign-in/email-otp", { data: { email: user.email, otp: code } });
  expect(signIn.status(), await signIn.text()).toBe(200);
  await expectSignedInAs(fresh, user.email);
});

test("two-factor authentication asks for a TOTP code after the password", async ({ api, page }) => {
  const user = await createUser(api, "totp");
  const secret = await enableTotp(api, user.password);

  await loginViaUi(page, user.email, user.password);
  await page.waitForURL(/\/two-factor/);
  expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
  await page.getByLabel("Code").fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(/\/dashboard|\/en$/);
  await expectSignedInAs(page.request, user.email);
});

test("password sign-in is rate limited per client IP with Retry-After", async ({ api, newApi }) => {
  const user = await createUser(api, "limited");
  const attacker = await newApi();
  // RATE_LIMIT_RULES: 10 a minute on /sign-in/email. This test has its own client IP.
  const statuses: number[] = [];
  let limited: Awaited<ReturnType<typeof signInWithPassword>> | undefined;
  for (let i = 0; i < 12 && !limited; i++) {
    const response = await signInWithPassword(attacker, user.email, "wrong-password-123");
    statuses.push(response.status());
    if (response.status() === 429) limited = response;
  }
  expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
  expect(limited, `statuses: ${statuses.join(",")}`).toBeDefined();
  const retryAfter = Number(limited!.headers()["retry-after"]);
  expect(retryAfter).toBeGreaterThan(0);
  expect(retryAfter).toBeLessThanOrEqual(60);
  expect(await limited!.json()).toMatchObject({ code: "RATE_LIMITED", retryAfter });

  // Even the right password is refused until the window ends.
  const right = await signInWithPassword(attacker, user.email, user.password);
  expect(right.status()).toBe(429);
});
