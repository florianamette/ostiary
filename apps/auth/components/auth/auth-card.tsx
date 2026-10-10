import { cn } from "@ostiary/core/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ostiary/core/components/ui/card";

/** A sign-in screen's card: a heading and description over the content; extra props go to the wrapper. */
export function AuthCard({
  className,
  heading,
  description,
  contentClassName,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  heading: React.ReactNode;
  description: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{heading}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className={contentClassName}>{children}</CardContent>
      </Card>
    </div>
  );
}
