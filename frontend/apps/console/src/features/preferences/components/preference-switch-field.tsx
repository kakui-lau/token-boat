import type { ComponentType } from "react";

import { Field, FieldDescription, FieldLabel } from "@token-boat/ui/components/ui/field";
import { Switch } from "@token-boat/ui/components/ui/switch";

type PreferenceSwitchFieldProps = {
  checked: boolean;
  description: string;
  icon: ComponentType<{ className?: string }>;
  id: string;
  label: string;
  onCheckedChange(checked: boolean): void;
};

export function PreferenceSwitchField(props: PreferenceSwitchFieldProps) {
  const Icon = props.icon;
  return (
    <Field orientation="horizontal">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
        <FieldDescription>{props.description}</FieldDescription>
      </div>
      <Switch checked={props.checked} id={props.id} onCheckedChange={props.onCheckedChange} />
    </Field>
  );
}
