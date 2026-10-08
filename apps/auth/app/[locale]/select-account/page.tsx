import { Suspense } from "react";

import { AuthScreen } from "@/components/auth/auth-screen";
import { SelectAccountForm } from "@/components/auth/select-account-form";

function SelectAccountFallback() {
  return <div className="h-64 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />;
}

export default async function SelectAccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <AuthScreen locale={locale}>
      <Suspense fallback={<SelectAccountFallback />}>
        <SelectAccountForm />
      </Suspense>
    </AuthScreen>
  );
}
