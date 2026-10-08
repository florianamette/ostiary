import { Suspense } from "react";

import { AuthScreen } from "@/components/auth/auth-screen";
import { DeviceForm } from "@/components/auth/device-form";

function DeviceFallback() {
  return <div className="h-80 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />;
}

/** RFC 8628 verification page (`verification_uri`). The proxy sends signed-out visitors to /login first. */
export default async function DevicePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <AuthScreen locale={locale}>
      <Suspense fallback={<DeviceFallback />}>
        <DeviceForm />
      </Suspense>
    </AuthScreen>
  );
}
