"use client";

import { CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@ostiary/core/components/ui/button";
import { Field, FieldTitle } from "@ostiary/core/components/ui/field";
import { Input } from "@ostiary/core/components/ui/input";
import { Label } from "@ostiary/core/components/ui/label";
import type { EventTypeOption } from "@/components/admin/webhooks/admin-webhooks-panel";

const GROUPS: EventTypeOption["group"][] = ["users", "security", "organizations"];

/** The events to send, in groups (users, security, organizations), each with select all. */
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
  const toggle = (types: string[], on: boolean) => {
    const next = new Set(selected);
    for (const type of types) {
      if (on) next.add(type);
      else next.delete(type);
    }
    onChange(next);
  };
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
      <div className="space-y-3">
        {GROUPS.map((group) => {
          const events = eventTypes.filter((e) => e.group === group);
          if (events.length === 0) return null;
          const types = events.map((e) => e.type);
          const chosen = types.filter((type) => selected.has(type)).length;
          const groupId = `${idPrefix}-group-${group}`;
          return (
            <fieldset key={group} className="rounded-md border border-border/80">
              <legend className="sr-only">{t(`groups.${group}`)}</legend>
              <div className="flex items-center gap-3 border-b border-border/60 bg-muted/40 px-3 py-2">
                <input
                  id={groupId}
                  type="checkbox"
                  className="size-4 shrink-0 rounded border-input"
                  checked={chosen === types.length}
                  ref={(el) => {
                    if (el) el.indeterminate = chosen > 0 && chosen < types.length;
                  }}
                  disabled={disabled}
                  onChange={(e) => toggle(types, e.target.checked)}
                />
                <Label htmlFor={groupId} className="flex-1 cursor-pointer justify-between text-sm font-medium">
                  {t(`groups.${group}`)}
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {chosen}/{types.length}
                  </span>
                </Label>
              </div>
              <ul className="divide-y divide-border/60">
                {events.map((event) => {
                  const id = `${idPrefix}-${event.type}`;
                  return (
                    <li key={event.type} className="flex items-start gap-3 px-3 py-2">
                      <input
                        id={id}
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 rounded border-input"
                        checked={selected.has(event.type)}
                        disabled={disabled}
                        onChange={(e) => toggle([event.type], e.target.checked)}
                      />
                      <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal">
                        <span className="font-mono text-xs">{event.type}</span>
                        <span className="text-xs text-muted-foreground">{event.description}</span>
                      </Label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
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
