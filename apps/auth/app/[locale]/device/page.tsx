import { Suspense } from "react";

import { AuthScreen } from "@/components/auth/auth-screen";
import { DeviceForm } from "@/components/auth/device-form";
import { deviceScreenApp } from "@/lib/app-context";

function DeviceFallback() {
  return <div className="h-80 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />;
}

/** RFC 8628 verification page (`verification_uri`). The proxy sends signed-out visitors to /login first. */
export default async function DevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  // The app's look once the code in the link names a pending request (not before).
  const app = await deviceScreenApp(await searchParams);
  return (
    <AuthScreen locale={locale} app={app} appIntent="continue">
      <Suspense fallback={<DeviceFallback />}>
        <DeviceForm />
      </Suspense>
    </AuthScreen>
  );
}
