import { Suspense } from "react";

import { AuthScreen } from "@/components/auth/auth-screen";
import { ConsentForm } from "@/components/auth/consent-form";

function ConsentFallback() {
  return <div className="h-64 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />;
}

export default async function ConsentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <AuthScreen locale={locale}>
      <Suspense fallback={<ConsentFallback />}>
        <ConsentForm />
      </Suspense>
    </AuthScreen>
  );
}
