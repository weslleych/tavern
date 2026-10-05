'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Heart, Minus, Plus, SlidersHorizontal, Swords } from 'lucide-react';
import type { PublicMonster, MonsterReference, MonsterHealthRequest } from '../types/game';
import { MonsterHealth, useMonsterName } from './bestiary-drawer';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuItem,
  ContextMenuSeparator,
} from './ui/context-menu';

export function MonsterActionsMenu({
  monster,
  panelId,
  busy,
  inCombat,
  point,
  onClose,
  onInspect,
  onAdjust,
  onCombat,
}: {
  monster: PublicMonster;
  panelId: string;
  busy: boolean;
  inCombat: boolean;
  point?: { x: number; y: number };
  onClose?: () => void;
  onInspect: () => void;
  onAdjust: (request: MonsterHealthRequest) => Promise<boolean>;
  onCombat: (request: MonsterReference) => Promise<boolean>;
}) {
  const t = useTranslations(),
    monsterName = useMonsterName();
  const [open, setOpen] = useState(!!point);
  const trigger = useRef<HTMLDivElement>(null);
  const name = monsterName(monster);
  const reference = { panelId, monsterId: monster.id };
  const atMax = monster.currentHp !== undefined && monster.currentHp === monster.maxHp;
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
            <span aria-hidden="true" style={{ left: point.x, top: point.y }} />
          ) : (
            <button type="button" disabled={busy} />
          )
        }
        className={point ? 'map-menu-anchor' : 'monster-actions-trigger'}
        aria-label={point ? undefined : t('monsters.actionsFor', { name })}
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
        aria-label={t('monsters.actionsFor', { name })}
      >
        <ContextMenuGroup>
          <ContextMenuLabel className="context-menu-label">{name}</ContextMenuLabel>
          <div className="context-menu-description">
            <MonsterHealth monster={monster} />
          </div>
          <ContextMenuSeparator className="context-menu-separator" />
          <ContextMenuItem
            disabled={monster.defeated || inCombat}
            onClick={() => void onCombat(reference)}
          >
            <Swords size={16} aria-hidden="true" />
            {t('monsters.enterCombat')}
          </ContextMenuItem>
          <ContextMenuItem onClick={onInspect}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {t('monsters.details')}
          </ContextMenuItem>
          <ContextMenuSeparator className="context-menu-separator" />
          {[-5, -1, 1, 5].map((delta) => (
            <ContextMenuItem
              key={delta}
              disabled={delta < 0 ? monster.defeated : atMax}
              onClick={() => void onAdjust({ ...reference, delta })}
            >
              {delta < 0 ? (
                <Minus size={16} aria-hidden="true" />
              ) : (
                <Plus size={16} aria-hidden="true" />
              )}
              {t(delta < 0 ? 'monsters.damage' : 'monsters.heal', { amount: Math.abs(delta) })}
            </ContextMenuItem>
          ))}
          <ContextMenuItem
            disabled={atMax || monster.maxHp === undefined}
            onClick={() => void onAdjust({ ...reference, current: monster.maxHp })}
          >
            <Heart size={16} aria-hidden="true" />
            {t('monsters.restoreHp')}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
