'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Crosshair, Minus, Plus, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import type { Panel, Terrain, Tile, Member, MapTool, MoveRequest } from '../../types/game';
import { drawTile } from './render';
import { drawCharacter } from './character';

interface Props {
  panel: Panel;
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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<HTMLCanvasElement | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const hover = useRef<{ x: number; y: number } | null>(null);
  const stroke = useRef(new Set<string>());
  const drag = useRef<{
    x: number;
    y: number;
    pan: boolean;
    cell: { x: number; y: number } | null;
    memberId?: string;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const moving = useRef(false);
  const sprites = useRef(new Map<string, HTMLImageElement>());
  const [spriteVersion, setSpriteVersion] = useState(0);
  const target =
    you.role === 'gm'
      ? members.find((member) => member.id === selectedMemberId && member.role === 'player')
      : you;

  useEffect(() => {
    const sources = new Set(panel.tiles.flatMap((tile) => (tile.sprite ? [tile.sprite] : [])));
    if (sprite) sources.add(sprite);
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
  }, [panel.tiles, sprite]);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      drawRef.current();
    });
  }, []);
  const fit = useCallback(() => {
    const width = panel.grid.cols * 32,
      height = panel.grid.rows * 32;
    const zoom = Math.max(
      0.2,
      Math.min(2, (size.current.width - 80) / width, (size.current.height - 80) / height),
    );
    setCamera({
      x: (size.current.width - width * zoom) / 2,
      y: (size.current.height - height * zoom) / 2,
      zoom,
    });
  }, [panel.grid.cols, panel.grid.rows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      size.current = { width, height };
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      fit();
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
        }
      if (hover.current && canEdit && (tool === 'paint' || tool === 'spawn')) {
        const { x, y } = hover.current;
        ctx.globalAlpha = 0.65;
        if (tool === 'paint') drawTile(ctx, terrain, x * 32, y * 32, 32);
        const image = sprite ? sprites.current.get(sprite) : undefined;
        if (tool === 'paint' && image?.complete && image.naturalWidth)
          ctx.drawImage(image, x * 32, y * 32, 32, 32);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#173f2d';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.strokeRect(x * 32, y * 32, 32, 32);
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
  ]);

  const cellAt = (event: PointerEvent<HTMLCanvasElement>) => {
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
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current.clear();
    const pan =
      tool === 'pan' || event.button === 1 || (tool !== 'move' && !canEdit) || event.altKey;
    const cell = cellAt(event);
    const hit =
      tool === 'move' && cell
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
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      pan,
      cell,
      memberId: hit?.id,
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
      } else if (tool !== 'move' && tool !== 'spawn') {
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
      if (tool === 'spawn' && canEdit) void onSpawn(hover.current || cursor);
      else paint(hover.current || cursor);
      void flushFog();
    } else if (event.key === '+' || event.key === '=') zoom(1.2);
    else if (event.key === '-') zoom(1 / 1.2);
  }
  return (
    <div className="canvas-area">
      <canvas
        ref={canvasRef}
        aria-label="Map canvas"
        aria-describedby="map-instructions"
        tabIndex={0}
        role="application"
        className={tool === 'pan' ? 'map-canvas pan-cursor' : 'map-canvas'}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={(event) => {
          const start = drag.current;
          if (
            start &&
            !start.pan &&
            tool === 'move' &&
            (start.memberId || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8)
          )
            void move(cellAt(event), start.memberId || target?.id);
          if (start && !start.pan && tool === 'spawn' && canEdit) {
            const cell = cellAt(event);
            if (cell) void onSpawn(cell);
          }
          void flushFog();
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
        {panel.grid.cols} × {panel.grid.rows} <span>/</span> 32 px tiles
      </div>
      {tool === 'move' && (
        <div className="movement-pad" aria-label="Character movement">
          <button
            aria-label="Move up"
            disabled={!canMove || !target?.token}
            onClick={() => step(0, -1)}
          >
            <ArrowUp size={18} />
          </button>
          <button
            aria-label="Move left"
            disabled={!canMove || !target?.token}
            onClick={() => step(-1, 0)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            aria-label="Move down"
            disabled={!canMove || !target?.token}
            onClick={() => step(0, 1)}
          >
            <ArrowDown size={18} />
          </button>
          <button
            aria-label="Move right"
            disabled={!canMove || !target?.token}
            onClick={() => step(1, 0)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      )}
      <div className="zoom-controls">
        <button className="icon-button" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">
          <Minus size={16} />
        </button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <button className="icon-button" onClick={() => zoom(1.2)} aria-label="Zoom in">
          <Plus size={16} />
        </button>
        <span className="control-divider" />
        <button className="icon-button" onClick={fit} aria-label="Fit map to view">
          <Crosshair size={17} />
        </button>
      </div>
      <p id="map-instructions" className="sr-only">
        {tool === 'move'
          ? you.role === 'gm'
            ? 'Select a player in the party or click their token. Click a destination or drag the player to move them. Arrow keys move the selected player.'
            : 'Use WASD or arrow keys to move one tile. Click an adjacent tile or drag your token one step.'
          : tool === 'spawn'
            ? 'Click the preferred spawn tile, or select it with arrows and press Enter.'
            : canEdit
              ? 'Drag to paint. Alt-drag or use the Hand tool to pan. Arrow keys select a tile; Enter paints it.'
              : 'Drag to pan. Your game master controls the map.'}{' '}
        Scroll or use plus and minus to zoom. Keyboard tile {cursor.x + 1}, {cursor.y + 1}.
      </p>
    </div>
  );
}
