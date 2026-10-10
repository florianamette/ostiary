import { FieldDescription } from "@ostiary/core/components/ui/field";
import type { UsernameStatus } from "@/lib/username";

/** The live result of the username check, under the username field. */
export function UsernameStatusHint({
  status,
  messages,
}: {
  status: UsernameStatus | "unchanged";
  messages: { checking: string; available: string; taken: string; invalid: string };
}) {
  return (
    <FieldDescription
      className={
        status === "taken" || status === "invalid"
          ? "text-destructive"
          : status === "available"
            ? "text-emerald-600 dark:text-emerald-500"
            : undefined
      }
    >
      {status === "checking" ||
      status === "available" ||
      status === "taken" ||
      status === "invalid"
        ? messages[status]
        : null}
    </FieldDescription>
  );
}
