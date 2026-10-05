'use client';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
export const Tabs = TabsPrimitive.Root;
export function TabsList(props: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List {...props} className={`tavern-tabs ${props.className ?? ''}`} />;
}
export function TabsTrigger(props: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger {...props} className={`tavern-tab ${props.className ?? ''}`} />;
}
export const TabsContent = TabsPrimitive.Content;
