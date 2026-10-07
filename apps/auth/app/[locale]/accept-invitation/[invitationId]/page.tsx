import { AuthScreen } from "@/components/auth/auth-screen";
import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ locale: string; invitationId: string }>;
}) {
  const { locale, invitationId } = await params;
  return (
    <AuthScreen locale={locale}>
      <AcceptInvitationForm invitationId={invitationId} />
    </AuthScreen>
  );
}
