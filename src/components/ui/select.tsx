'use client';

// Adapted from shadcn/ui's Radix Select to the Tavern design system.
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className = '',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={`select-trigger ${className}`}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown size={16} aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className = '',
  children,
  container,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & { container?: HTMLElement }) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={`select-content ${className}`}
        position={position}
        sideOffset={4}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="select-scroll">
          <ChevronUp size={16} />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="select-viewport">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="select-scroll">
          <ChevronDown size={16} />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className = '',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item data-slot="select-item" className={`select-item ${className}`} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="select-indicator">
        <Check size={16} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function FormSelect({
  label,
  options,
  ...props
}: React.ComponentProps<typeof Select> & {
  label: string;
  options: { value: string; label: string; lang?: string }[];
}) {
  const id = React.useId();
  const [container, setContainer] = React.useState<HTMLElement>();
  return (
    <Select
      {...props}
      onOpenChange={(open) => {
        // A native modal's top layer must also contain its portalled menu.
        if (open) setContainer(document.getElementById(id)?.closest('dialog') ?? document.body);
        props.onOpenChange?.(open);
      }}
    >
      <SelectTrigger id={id} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent container={container}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} lang={option.lang}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
