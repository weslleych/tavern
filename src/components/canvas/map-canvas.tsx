'use client';

import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Crosshair, Minus, Plus, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import type {
  PublicPanel,
  Terrain,
  Tile,
  Member,
  MapTool,
  MoveRequest,
  MonsterMoveRequest,
} from '../../types/game';
import { drawTile, drawStructure } from './render';
import { drawMonster } from './monster-render';
import { structureTemplates } from '../../lib/terrain';
import { walkable } from '../../lib/characters';
import { drawCharacter } from './character';

interface Props {
  panel: PublicPanel;
  terrain: Terrain;
  blocked: boolean;
  canEdit: boolean;
  tool: MapTool;
  gridVisible: boolean;
  collisionsVisible: boolean;
  onPaint: (tile: Tile) => void;
  members: Member[];
  you: Member;
  canMove: boolean;
  sprite?: string;
  selectedMemberId?: string;
  onSelectMember: (memberId: string) => void;
  onMove: (token: MoveRequest) => Promise<boolean>;
  onSpawn: (point: { x: number; y: number }) => Promise<boolean>;
  onFog: (cells: { x: number; y: number }[], revealed: boolean) => Promise<boolean>;
  structureKey?: string;
  onPlaceStructure?: (cell: { x: number; y: number }) => Promise<boolean>;
  onInspectStructure?: (id: string, point: { x: number; y: number }) => void;
  onInspectMonster?: (id: string, point: { x: number; y: number }) => void;
  onSummon?: (cell: { x: number; y: number }) => Promise<boolean>;
  onMoveMonster?: (request: MonsterMoveRequest) => Promise<boolean>;
}
export function MapCanvas({
  panel,
  terrain,
  blocked,
  canEdit,
  tool,
  gridVisible,
  collisionsVisible,
  onPaint,
  members,
  you,
  canMove,
  sprite,
  onMove,
  selectedMemberId,
  onSelectMember,
  onSpawn,
  onFog,
  structureKey,
  onPlaceStructure,
  onInspectStructure,
  onInspectMonster,
  onSummon,
  onMoveMonster,
}: Props) {
  const t = useTranslations();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLCanvasElement | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const initialized = useRef(false);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const stroke = useRef(new Set<string>());
  const drag = useRef<{
    x: number;
    y: number;
    pan: boolean;
    cell: { x: number; y: number } | null;
    memberId?: string;
    monsterId?: string;
    structureId?: string;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const moving = useRef(false);
  const sprites = useRef(new Map<string, HTMLImageElement>());
  const [spriteVersion, setSpriteVersion] = useState(0);
  const structureTemplate = structureTemplates.find((template) => template.key === structureKey);
  const target =
    you.role === 'gm'
      ? members.find((member) => member.id === selectedMemberId && member.role === 'player')
      : you;

  useEffect(() => {
    const sources = new Set(panel.tiles.flatMap((tile) => (tile.sprite ? [tile.sprite] : [])));
    if (sprite) sources.add(sprite);
    for (const monster of panel.monsters ?? [])
      if (monster.sprite.startsWith('data:')) sources.add(monster.sprite);
    for (const source of sprites.current.keys())
      if (!sources.has(source)) sprites.current.delete(source);
    let active = true;
    for (const source of sources) {
      let image = sprites.current.get(source);
      if (!image) {
        image = new Image();
        sprites.current.set(source, image);
        image.src = source;
      }
      if (!image.complete)
        image.onload = () => {
          if (active) setSpriteVersion((version) => version + 1);
        };
    }
    return () => {
      active = false;
    };
  }, [panel.tiles, panel.monsters, sprite]);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      drawRef.current();
    });
  }, []);
  const fit = useCallback(() => {
    if (size.current.width === 0 || size.current.height === 0) return;
    initialized.current = true;
    const width = panel.grid.cols * 32,
      height = panel.grid.rows * 32;
    // Fit within the space between visible overlays. Read their bounds only on an
    // explicit/initial fit; changing tools never changes the user's camera.
    const workspace = canvasRef.current?.closest('.map-workspace');
    const bounds = canvasRef.current?.getBoundingClientRect();
    let top = 72,
      bottom = 48;
    if (workspace && bounds) {
      for (const overlay of workspace.querySelectorAll('.map-top-tools, .map-hud-stack')) {
        const rect = overlay.getBoundingClientRect();
        if (rect.height > 0) top = Math.max(top, rect.bottom - bounds.top + 8);
      }
      for (const overlay of workspace.querySelectorAll(
        '.brush-dock, .player-view-note, .zoom-controls',
      )) {
        const rect = overlay.getBoundingClientRect();
        if (rect.height > 0) bottom = Math.max(bottom, bounds.bottom - rect.top + 8);
      }
    }
    const zoom = Math.max(
      0.2,
      Math.min(2, (size.current.width - 80) / width, (size.current.height - top - bottom) / height),
    );
    setCamera({
      x: (size.current.width - width * zoom) / 2,
      y: top + (size.current.height - top - bottom - height * zoom) / 2,
      zoom,
    });
  }, [panel.grid.cols, panel.grid.rows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      const previous = size.current;
      size.current = { width, height };
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      if (!initialized.current) fit();
      else {
        const dx = (width - previous.width) / 2,
          dy = (height - previous.height) / 2;
        if (dx !== 0 || dy !== 0)
          setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      }
      schedule();
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [fit, schedule]);

  useEffect(() => {
    const world = document.createElement('canvas');
    world.width = panel.grid.cols * 32;
    world.height = panel.grid.rows * 32;
    const ctx = world.getContext('2d');
    if (!ctx) return;
    const tiles = new Map(panel.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
    for (let y = 0; y < panel.grid.rows; y++)
      for (let x = 0; x < panel.grid.cols; x++) {
        const tile = tiles.get(`${x},${y}`);
        drawTile(ctx, tile?.terrain || 'empty', x * 32, y * 32, 32, x + y);
        const image = tile?.sprite ? sprites.current.get(tile.sprite) : undefined;
        if (image?.complete && image.naturalWidth) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(image, x * 32, y * 32, 32, 32);
        }
        if (collisionsVisible && tile?.blocked) {
          ctx.fillStyle = '#8c42374a';
          ctx.fillRect(x * 32, y * 32, 32, 32);
          ctx.strokeStyle = '#9c504c';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x * 32 + 12, y * 32 + 12);
          ctx.lineTo(x * 32 + 20, y * 32 + 20);
          ctx.moveTo(x * 32 + 20, y * 32 + 12);
          ctx.lineTo(x * 32 + 12, y * 32 + 20);
          ctx.stroke();
        }
      }
    for (const anchor of panel.structures ?? [])
      drawStructure(
        ctx,
        anchor.templateKey,
        anchor.x * 32,
        anchor.y * 32,
        anchor.cols,
        anchor.rows,
      );
    if (panel.fog?.enabled) {
      const revealed = new Set(panel.fog.revealed);
      ctx.fillStyle = you.role === 'gm' ? '#172d2a70' : '#172d2a';
      for (let y = 0; y < panel.grid.rows; y++)
        for (let x = 0; x < panel.grid.cols; x++)
          if (!revealed.has(`${x},${y}`)) ctx.fillRect(x * 32, y * 32, 32, 32);
    }
    if (gridVisible) {
      ctx.strokeStyle = '#325b3c24';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= panel.grid.cols; x++) {
        ctx.moveTo(x * 32 + 0.5, 0);
        ctx.lineTo(x * 32 + 0.5, world.height);
      }
      for (let y = 0; y <= panel.grid.rows; y++) {
        ctx.moveTo(0, y * 32 + 0.5);
        ctx.lineTo(world.width, y * 32 + 0.5);
      }
      ctx.stroke();
    }
    worldRef.current = world;
    schedule();
  }, [panel, gridVisible, collisionsVisible, schedule, you.role, spriteVersion]);

  useEffect(() => {
    drawRef.current = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !worldRef.current) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, size.current.width, size.current.height);
      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = '#263e2825';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetY = 9;
      ctx.drawImage(worldRef.current, 0, 0);
      ctx.shadowColor = 'transparent';
      if (you.role === 'gm' && panel.spawnPoint) {
        const { x, y } = panel.spawnPoint;
        ctx.strokeStyle = '#c7a34d';
        ctx.lineWidth = 2;
        ctx.strokeRect(x * 32 + 2, y * 32 + 2, 28, 28);
        ctx.fillStyle = '#c7a34d';
        ctx.fillRect(x * 32 + 5, y * 32 + 5, 2, 20);
        ctx.fillRect(x * 32 + 7, y * 32 + 5, 14, 9);
      }
      for (const member of members)
        if (member.role === 'player' && member.character && member.token?.panelId === panel.id) {
          const { x, y } = member.token;
          ctx.strokeStyle = member.id === target?.id ? '#c7a34d' : '#efe4c8';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x * 32 + 1, y * 32 + 1, 30, 30);
          drawCharacter(ctx, member.character, x * 32, y * 32, 32);
          ctx.font = '9px sans-serif';
          const label = member.nickname.slice(0, 16);
          const width = ctx.measureText(label).width;
          ctx.fillStyle = '#172d2ae0';
          ctx.fillRect(x * 32 + 16 - width / 2 - 3, y * 32 - 12, width + 6, 11);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.fillText(label, x * 32 + 16, y * 32 - 3);
          if (member.health) {
            const fraction = member.health.current / member.health.max;
            ctx.fillStyle = '#172d2a';
            ctx.fillRect(x * 32 + 3, y * 32 - 19, 26, 5);
            ctx.fillStyle = fraction > 0.5 ? '#22c55e' : fraction >= 0.25 ? '#f59e0b' : '#ef4444';
            ctx.fillRect(x * 32 + 4, y * 32 - 18, 24 * fraction, 3);
            if (member.health.current === 0) {
              ctx.fillStyle = '#172d2a';
              ctx.fillRect(x * 32 + 8, y * 32 + 19, 16, 11);
              ctx.fillStyle = '#fff';
              ctx.fillText('KO', x * 32 + 16, y * 32 + 28);
            }
          }
        }
      for (const monster of panel.monsters ?? [])
        drawMonster(ctx, monster, sprites.current.get(monster.sprite));
      if (hover.current && canEdit && (tool === 'paint' || tool === 'spawn' || tool === 'summon')) {
        const { x, y } = hover.current;
        ctx.globalAlpha = 0.65;
        if (tool === 'paint' && !structureTemplate) drawTile(ctx, terrain, x * 32, y * 32, 32);
        if (tool === 'paint' && structureTemplate)
          drawStructure(
            ctx,
            structureTemplate.key,
            x * 32,
            y * 32,
            structureTemplate.cols,
            structureTemplate.rows,
          );
        const image = sprite ? sprites.current.get(sprite) : undefined;
        if (tool === 'paint' && image?.complete && image.naturalWidth)
          ctx.drawImage(image, x * 32, y * 32, 32, 32);
        ctx.globalAlpha = 1;
        const cols = tool === 'paint' ? (structureTemplate?.cols ?? 1) : 1,
          rows = tool === 'paint' ? (structureTemplate?.rows ?? 1) : 1;
        const valid =
          x + cols <= panel.grid.cols &&
          y + rows <= panel.grid.rows &&
          (tool !== 'summon' ||
            (walkable(panel, { x, y }) &&
              !members.some(
                (m) => m.token?.panelId === panel.id && m.token.x === x && m.token.y === y,
              )));
        ctx.strokeStyle = valid ? '#278855' : '#ef4444';
        if (structureTemplate || tool === 'summon') {
          ctx.fillStyle = valid ? '#22c55e33' : '#ef444455';
          ctx.fillRect(x * 32, y * 32, cols * 32, rows * 32);
        }
        ctx.lineWidth = 2 / camera.zoom;
        ctx.strokeRect(x * 32, y * 32, cols * 32, rows * 32);
      }
      ctx.restore();
    };
    schedule();
  }, [
    camera,
    terrain,
    canEdit,
    tool,
    schedule,
    members,
    you.role,
    target?.id,
    panel.id,
    panel.spawnPoint,
    sprite,
    spriteVersion,
    panel,
    structureTemplate,
  ]);

  const cellAt = (
    event: Pick<PointerEvent<HTMLCanvasElement>, 'clientX' | 'clientY' | 'currentTarget'>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left - camera.x) / camera.zoom / 32);
    const y = Math.floor((event.clientY - rect.top - camera.y) / camera.zoom / 32);
    return x >= 0 && y >= 0 && x < panel.grid.cols && y < panel.grid.rows ? { x, y } : null;
  };
  const paint = (cell: { x: number; y: number } | null) => {
    if (!canEdit || !cell) return;
    const key = `${cell.x},${cell.y}`;
    if (stroke.current.has(key)) return;
    stroke.current.add(key);
    if (tool === 'reveal' || tool === 'hide') return;
    if (tool === 'paint' && structureTemplate) {
      if (
        cell.x + structureTemplate.cols <= panel.grid.cols &&
        cell.y + structureTemplate.rows <= panel.grid.rows
      )
        void onPlaceStructure?.(cell);
      return;
    }
    if (tool === 'paint')
      onPaint({
        ...cell,
        terrain,
        blocked: terrain === 'empty' ? false : blocked,
        ...(sprite && terrain !== 'empty' ? { sprite } : {}),
      });
  };
  async function flushFog() {
    if (!canEdit || (tool !== 'reveal' && tool !== 'hide')) return;
    const cells = [...stroke.current].map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
    stroke.current.clear();
    for (let start = 0; start < cells.length; start += 64)
      if (!(await onFog(cells.slice(start, start + 64), tool === 'reveal'))) break;
  }
  async function move(cell: { x: number; y: number } | null, memberId = target?.id) {
    const player = members.find((member) => member.id === memberId);
    if (
      !canMove ||
      moving.current ||
      !cell ||
      !player?.token ||
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= panel.grid.cols ||
      cell.y >= panel.grid.rows ||
      (cell.x === player.token.x && cell.y === player.token.y)
    )
      return;
    moving.current = true;
    try {
      await onMove({ ...cell, panelId: panel.id, ...(you.role === 'gm' ? { memberId } : {}) });
    } finally {
      moving.current = false;
    }
  }
  function step(dx: number, dy: number) {
    if (target?.token) void move({ x: target.token.x + dx, y: target.token.y + dy });
  }
  function paintLine(from: { x: number; y: number } | null, to: { x: number; y: number } | null) {
    if (!from || !to) {
      paint(to);
      return;
    }
    // Pointer events can skip cells during a fast stroke. Fill the connecting line.
    let { x, y } = from;
    const deltaX = Math.abs(to.x - x),
      deltaY = -Math.abs(to.y - y);
    const stepX = x < to.x ? 1 : -1,
      stepY = y < to.y ? 1 : -1;
    let error = deltaX + deltaY;
    while (true) {
      paint({ x, y });
      if (x === to.x && y === to.y) break;
      const doubled = error * 2;
      if (doubled >= deltaY) {
        error += deltaY;
        x += stepX;
      }
      if (doubled <= deltaX) {
        error += deltaX;
        y += stepY;
      }
    }
  }
  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current.clear();
    const pan =
      tool === 'pan' ||
      event.button === 1 ||
      event.button === 2 ||
      (tool !== 'move' && !canEdit) ||
      event.altKey;
    const cell = cellAt(event);
    const hit =
      !pan && tool === 'move' && cell
        ? members.find(
            (member) =>
              member.role === 'player' &&
              member.token?.panelId === panel.id &&
              member.token.x === cell.x &&
              member.token.y === cell.y &&
              (you.role === 'gm' || member.id === you.id),
          )
        : undefined;
    if (!pan && canMove && hit && you.role === 'gm') onSelectMember(hit.id);
    const monster =
      !pan && tool === 'move' && canEdit && cell
        ? panel.monsters?.find((m) => m.x === cell.x && m.y === cell.y)
        : undefined;
    const anchor =
      !pan && tool === 'move' && canEdit && cell
        ? panel.structures?.find(
            (s) =>
              s.templateKey.startsWith('poi_') &&
              cell.x >= s.x &&
              cell.y >= s.y &&
              cell.x < s.x + s.cols &&
              cell.y < s.y + s.rows,
          )
        : undefined;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      pan,
      cell,
      memberId: hit?.id,
      monsterId: monster?.id,
      structureId: anchor?.id,
    };
    if (!pan && tool !== 'move') paint(cell);
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    hover.current = cellAt(event);
    if (drag.current) {
      if (drag.current.pan) {
        const dx = event.clientX - drag.current.x,
          dy = event.clientY - drag.current.y;
        setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
        drag.current.x = event.clientX;
        drag.current.y = event.clientY;
      } else if (tool !== 'move' && tool !== 'spawn' && tool !== 'summon' && !structureTemplate) {
        paintLine(drag.current.cell, hover.current);
        drag.current.cell = hover.current;
      }
    }
    schedule();
  }
  function zoom(factor: number) {
    setCamera((current) => {
      const next = Math.max(0.2, Math.min(4, current.zoom * factor));
      return {
        zoom: next,
        x: size.current.width / 2 - ((size.current.width / 2 - current.x) * next) / current.zoom,
        y: size.current.height / 2 - ((size.current.height / 2 - current.y) * next) / current.zoom,
      };
    });
  }
  function keyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const movement: Record<string, [number, number]> = {
      ...delta,
      w: [0, -1],
      s: [0, 1],
      a: [-1, 0],
      d: [1, 0],
    };
    if (tool === 'move' && (delta[event.key] || movement[event.key.toLowerCase()])) {
      event.preventDefault();
      const [dx, dy] = delta[event.key] || movement[event.key.toLowerCase()];
      step(dx, dy);
    } else if (delta[event.key]) {
      event.preventDefault();
      const [dx, dy] = delta[event.key];
      const next = {
        x: Math.max(0, Math.min(panel.grid.cols - 1, cursor.x + dx)),
        y: Math.max(0, Math.min(panel.grid.rows - 1, cursor.y + dy)),
      };
      hover.current = next;
      setCursor(next);
      schedule();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      stroke.current.clear();
      const cell = hover.current || cursor;
      const monster =
        canEdit && tool === 'move' && panel.monsters?.find((m) => m.x === cell.x && m.y === cell.y);
      if (monster) {
        const bounds = event.currentTarget.getBoundingClientRect();
        onInspectMonster?.(monster.id, {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        });
        return;
      }
      const poi =
        canEdit &&
        tool === 'move' &&
        panel.structures?.find(
          (s) =>
            s.templateKey.startsWith('poi_') &&
            cell.x >= s.x &&
            cell.y >= s.y &&
            cell.x < s.x + s.cols &&
            cell.y < s.y + s.rows,
        );
      if (poi) {
        const bounds = event.currentTarget.getBoundingClientRect();
        onInspectStructure?.(poi.id, {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        });
        return;
      }
      if (tool === 'spawn' && canEdit) void onSpawn(hover.current || cursor);
      else if (tool === 'summon' && canEdit) void onSummon?.(hover.current || cursor);
      else paint(hover.current || cursor);
      void flushFog();
    } else if (event.key === '+' || event.key === '=') zoom(1.2);
    else if (event.key === '-') zoom(1 / 1.2);
  }
  return (
    <div className="canvas-area">
      <canvas
        ref={canvasRef}
        aria-label={t('tabletop.mapCanvas')}
        aria-describedby="map-instructions"
        tabIndex={0}
        role="application"
        className={tool === 'pan' ? 'map-canvas pan-cursor' : 'map-canvas'}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onContextMenu={(event) => {
          event.preventDefault();
          const cell = cellAt(event);
          const monster =
            canEdit && cell && panel.monsters?.find((m) => m.x === cell.x && m.y === cell.y);
          if (monster) {
            onInspectMonster?.(monster.id, { x: event.clientX, y: event.clientY });
            return;
          }
          const poi =
            canEdit &&
            cell &&
            panel.structures?.find(
              (s) =>
                s.templateKey.startsWith('poi_') &&
                cell.x >= s.x &&
                cell.y >= s.y &&
                cell.x < s.x + s.cols &&
                cell.y < s.y + s.rows,
            );
          if (poi) onInspectStructure?.(poi.id, { x: event.clientX, y: event.clientY });
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          const cell = cellAt(event);
          if (start && !start.pan && start.monsterId && canEdit) {
            if (
              cell?.x === start.cell?.x &&
              cell?.y === start.cell?.y &&
              Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
            )
              onInspectMonster?.(start.monsterId, { x: event.clientX, y: event.clientY });
            else if (cell)
              void onMoveMonster?.({ ...cell, panelId: panel.id, monsterId: start.monsterId });
          } else if (
            start &&
            !start.pan &&
            start.structureId &&
            !start.memberId &&
            canEdit &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
          )
            onInspectStructure?.(start.structureId, { x: event.clientX, y: event.clientY });
          if (
            start &&
            !start.pan &&
            !start.monsterId &&
            !start.structureId &&
            tool === 'move' &&
            (start.memberId || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8)
          )
            void move(cellAt(event), start.memberId || target?.id);
          if (start && !start.pan && tool === 'spawn' && canEdit) {
            const cell = cellAt(event);
            if (cell) void onSpawn(cell);
          }
          if (start && !start.pan && tool === 'summon' && canEdit && cell) void onSummon?.(cell);
          if (start && !start.pan) void flushFog();
          drag.current = null;
          stroke.current.clear();
        }}
        onPointerCancel={() => {
          drag.current = null;
          stroke.current.clear();
        }}
        onPointerLeave={() => {
          hover.current = null;
          schedule();
        }}
        onFocus={() => {
          hover.current = cursor;
          schedule();
        }}
        onKeyDown={keyDown}
        onWheel={(event) => zoom(event.deltaY > 0 ? 1 / 1.1 : 1.1)}
      />
      <div className="map-coordinate" aria-live="polite">
        {panel.grid.cols} × {panel.grid.rows} <span>/</span> {t('tabletop.pixelTiles')}
      </div>
      {tool === 'move' && (
        <div className="movement-pad" aria-label={t('tabletop.characterMovement')}>
          <button
            aria-label={t('tabletop.moveUp')}
            disabled={!canMove || !target?.token}
            onClick={() => step(0, -1)}
          >
            <ArrowUp size={18} />
          </button>
          <button
            aria-label={t('tabletop.moveLeft')}
            disabled={!canMove || !target?.token}
            onClick={() => step(-1, 0)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            aria-label={t('tabletop.moveDown')}
            disabled={!canMove || !target?.token}
            onClick={() => step(0, 1)}
          >
            <ArrowDown size={18} />
          </button>
          <button
            aria-label={t('tabletop.moveRight')}
            disabled={!canMove || !target?.token}
            onClick={() => step(1, 0)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      )}
      <div className="zoom-controls">
        <button
          className="icon-button"
          onClick={() => zoom(1 / 1.2)}
          aria-label={t('tabletop.zoomOut')}
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <button className="icon-button" onClick={() => zoom(1.2)} aria-label={t('tabletop.zoomIn')}>
          <Plus size={16} />
        </button>
        <span className="control-divider" />
        <button className="icon-button" onClick={fit} aria-label={t('tabletop.fitMap')}>
          <Crosshair size={17} />
        </button>
      </div>
      <p id="map-instructions" className="sr-only">
        {tool === 'move'
          ? you.role === 'gm'
            ? t('tabletop.gmMoveInstructions')
            : t('tabletop.playerMoveInstructions')
          : tool === 'spawn'
            ? t('tabletop.spawnInstructions')
            : canEdit
              ? t('tabletop.paintInstructions')
              : t('tabletop.panInstructions')}{' '}
        {t('tabletop.keyboardInstructions', { x: cursor.x + 1, y: cursor.y + 1 })}
      </p>
    </div>
  );
}
