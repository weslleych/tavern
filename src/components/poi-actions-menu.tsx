'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2, Unlink, MapPlus, ChevronDown } from 'lucide-react';
import type { PoiConfiguration, StructureAnchor, Snapshot } from '../types/game';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuItem,
  ContextMenuSeparator,
} from './ui/context-menu';

export type PoiLinkAction = 'link' | 'town' | 'dungeon';

export function PoiActionsMenu({
  anchor,
  panelId,
  panels,
  busy,
  point,
  onClose,
  onChoose,
  onSave,
}: {
  anchor: StructureAnchor;
  panelId: string;
  panels: Snapshot['panels'];
  busy: boolean;
  point?: { x: number; y: number };
  onClose?: () => void;
  onChoose: (action: PoiLinkAction) => void;
  onSave: (request: PoiConfiguration) => Promise<boolean>;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(!!point);
  const trigger = useRef<HTMLDivElement>(null);
  const name = anchor.name ?? t(`world.${anchor.templateKey}`);
  const destination = panels.find((p) => p.id === anchor.targetPanelId);
  return (
    <ContextMenu
      open={open}
      disabled={busy}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onClose?.();
      }}
    >
      <ContextMenuTrigger
        ref={trigger}
        render={
          point ? (
            <span
              aria-hidden="true"
              className="map-menu-anchor"
              style={{ left: point.x, top: point.y }}
            />
          ) : (
            <button type="button" disabled={busy} />
          )
        }
        className={point ? 'map-menu-anchor' : 'button secondary poi-actions-trigger'}
        aria-label={point ? undefined : t('world.actionsFor', { name })}
        aria-haspopup={point ? undefined : 'menu'}
        aria-expanded={point ? undefined : open}
        onClick={() => setOpen(true)}
      >
        {!point && (
          <>
            <span>{name}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent
        anchor={
          point
            ? { getBoundingClientRect: () => DOMRect.fromRect({ x: point.x, y: point.y }) }
            : trigger
        }
        finalFocus={point ? () => document.querySelector<HTMLCanvasElement>('.map-canvas') : true}
        aria-label={t('world.actionsFor', { name })}
      >
        <ContextMenuGroup>
          <ContextMenuLabel className="context-menu-label">{name}</ContextMenuLabel>
          <p className="context-menu-description">
            {destination ? t('world.linkedTo', { name: destination.name }) : t('world.unlinked')}
          </p>
          <ContextMenuSeparator className="context-menu-separator" />
          <ContextMenuItem onClick={() => onChoose('link')}>
            <Link2 size={16} aria-hidden="true" />
            {t('world.linkExisting')}
          </ContextMenuItem>
          <ContextMenuItem disabled={panels.length >= 30} onClick={() => onChoose('town')}>
            <MapPlus size={16} aria-hidden="true" />
            {t('world.createLinkedTown')}
          </ContextMenuItem>
          <ContextMenuItem disabled={panels.length >= 30} onClick={() => onChoose('dungeon')}>
            <MapPlus size={16} aria-hidden="true" />
            {t('world.createLinkedDungeon')}
          </ContextMenuItem>
          {anchor.targetPanelId && (
            <>
              <ContextMenuSeparator className="context-menu-separator" />
              <ContextMenuItem
                onClick={() =>
                  void onSave({ panelId, structureId: anchor.id, name, targetPanelId: null })
                }
              >
                <Unlink size={16} aria-hidden="true" />
                {t('world.unlinkScene')}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
