'use client';

// Adapted from shadcn/ui's Base UI Context Menu to the Tavern design system.
import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuLabel = ContextMenuPrimitive.GroupLabel;
export const ContextMenuSeparator = ContextMenuPrimitive.Separator;

export function ContextMenuContent({
  children,
  anchor,
  ...props
}: ContextMenuPrimitive.Popup.Props & Pick<ContextMenuPrimitive.Positioner.Props, 'anchor'>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        anchor={anchor}
        align="start"
        sideOffset={4}
        className="context-menu-positioner"
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className="context-menu-content"
          {...props}
        >
          {children}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem(props: ContextMenuPrimitive.Item.Props) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      className="context-menu-item"
      {...props}
    />
  );
}
