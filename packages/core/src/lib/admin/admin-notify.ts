import { toast } from "sonner";

/** Toast for admin panel row actions (bottom-right via root `<Toaster />`). */
export function adminNotify(
  message: string,
  variant: "error" | "success" = "success"
) {
  if (variant === "error") {
    toast.error(message);
    return;
  }
  toast.success(message);
}
