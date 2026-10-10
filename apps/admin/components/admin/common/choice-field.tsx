import { Label } from "@ostiary/core/components/ui/label";

/** A checkbox in a bordered box, with its label and a hint below. */
export function CheckboxField({
  id,
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  hint: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="grid gap-1">
        <Label htmlFor={id} className="cursor-pointer font-medium leading-none">
          {label}
        </Label>
        <p className="text-muted-foreground text-xs leading-snug">{hint}</p>
      </div>
    </div>
  );
}

/** A radio button in a bordered box (highlighted when chosen), with its label and a hint below. */
export function RadioField({
  id,
  name,
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-border/80 bg-muted/30 p-3 has-checked:border-primary/60">
      <input
        id={id}
        name={name}
        type="radio"
        className="mt-0.5 size-4 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <div className="grid gap-1">
        <Label htmlFor={id} className="cursor-pointer font-medium leading-none">
          {label}
        </Label>
        <p className="text-muted-foreground text-xs leading-snug">{hint}</p>
      </div>
    </div>
  );
}
