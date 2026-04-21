"use client";

import * as React from "react";
import { CheckIcon } from "lucide-react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

export interface SettingOption {
  value: string;
  label: string;
  description?: string;
  /**
   * Optional models.dev provider slug (e.g. `"anthropic"`, `"openai"`). When
   * set, `ModelSelectorLogo` is rendered next to the option and inside the
   * trigger for the currently selected value.
   */
  provider?: string;
}

interface SettingPickerProps {
  icon?: React.ReactNode;
  label: string;
  value: string;
  options: SettingOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function SettingPicker({
  icon,
  label,
  value,
  options,
  onValueChange,
  disabled,
}: SettingPickerProps) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger
        render={
          <PromptInputButton
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs"
            disabled={disabled}
          />
        }
      >
        {current?.provider ? (
          <ModelSelectorLogo provider={current.provider} className="size-3.5" />
        ) : icon ? (
          <span className="text-muted-foreground">{icon}</span>
        ) : null}
        <span className="text-foreground font-medium">
          {current?.label ?? value}
        </span>
      </ModelSelectorTrigger>
      <ModelSelectorContent title={label} className="sm:max-w-md">
        <ModelSelectorList>
          <ModelSelectorEmpty>
            No {label.toLowerCase()} found.
          </ModelSelectorEmpty>
          <ModelSelectorGroup heading={label}>
            {options.map((opt) => {
              const isActive = opt.value === value;
              return (
                <ModelSelectorItem
                  key={opt.value}
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  {opt.provider ? (
                    <ModelSelectorLogo
                      provider={opt.provider}
                      className="size-4 shrink-0"
                    />
                  ) : null}
                  <ModelSelectorName>
                    <span className="font-medium">{opt.label}</span>
                    {opt.description ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {opt.description}
                      </span>
                    ) : null}
                  </ModelSelectorName>
                  <CheckIcon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                </ModelSelectorItem>
              );
            })}
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
