"use client";

import { CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import { Field, FieldTitle } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import type { EventTypeOption } from "@/components/admin/webhooks/admin-webhooks-panel";

export function EventChoices({
  idPrefix,
  eventTypes,
  selected,
  onChange,
  disabled,
}: {
  idPrefix: string;
  eventTypes: EventTypeOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("admin.pages.webhooks.panel");
  const all = selected.size === eventTypes.length;
  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>{t("events")}</FieldTitle>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange(all ? new Set() : new Set(eventTypes.map((e) => e.type)))}
        >
          {all ? t("clear") : t("selectAll")}
        </Button>
      </div>
      <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/80">
        {eventTypes.map((event) => {
          const id = `${idPrefix}-${event.type}`;
          return (
            <li key={event.type} className="flex items-start gap-3 px-3 py-2">
              <input
                id={id}
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 rounded border-input"
                checked={selected.has(event.type)}
                disabled={disabled}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(event.type);
                  else next.delete(event.type);
                  onChange(next);
                }}
              />
              <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal">
                <span className="font-mono text-xs">{event.type}</span>
                <span className="text-xs text-muted-foreground">{event.description}</span>
              </Label>
            </li>
          );
        })}
      </ul>
    </Field>
  );
}

/** Shows a signing secret once, with a copy button. */
export function SecretReveal({ secret }: { secret: string }) {
  const t = useTranslations("admin.pages.webhooks.panel");
  return (
    <div className="grid gap-2 py-2">
      <Label htmlFor="webhook-secret">{t("signingSecret")}</Label>
      <Input id="webhook-secret" readOnly value={secret} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => void navigator.clipboard.writeText(secret).then(() => toast.success(t("secretCopied")))}
      >
        <CopyIcon aria-hidden />
        {t("copySecret")}
      </Button>
    </div>
  );
}
