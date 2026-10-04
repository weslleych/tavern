'use client';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { rememberTable, sessionFor } from './sessions';
import type {
  ClientEvents,
  Reply,
  SceneRequest,
  ServerEvents,
  Snapshot,
  Tile,
  CharacterAppearance,
  MoveRequest,
  SpawnRequest,
  DiceRequest,
  FogRequest,
} from '../types/game';

export function useRoom(code: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const socket = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const paintQueue = useRef(new Map<string, Tile>());
  const paintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<Snapshot | null>(null);

  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (pending > 0 || paintQueue.current.size > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnIfUnsaved);
    return () => window.removeEventListener('beforeunload', warnIfUnsaved);
  }, [pending]);

  useEffect(() => {
    let active = true;
    const queuedPaint = paintQueue.current;
    let connection: Socket<ServerEvents, ClientEvents> | undefined;
    Promise.resolve().then(() => {
      if (!active) return;
      const credential = sessionFor(code);
      if (!credential) {
        setStatus('Join this table');
        setError('Ask your game master for the table code, then join with your nickname.');
        return;
      }
      connection = io({ auth: credential, transports: ['websocket', 'polling'] });
      socket.current = connection;
      connection.on('room:snapshot', (data) => {
        current.current = data;
        setSnapshot(data);
        setStatus('Connected');
        setError('');
        try {
          rememberTable(credential, data.room.name);
        } catch {
          /* The active session can continue if storage becomes unavailable. */
        }
      });
      connection.on('room:presence', (members) =>
        setSnapshot((previous) =>
          previous
            ? {
                ...previous,
                members,
                you: members.find((member) => member.id === previous.you.id) || previous.you,
              }
            : previous,
        ),
      );
      connection.on('token:moved', (update) =>
        setSnapshot((previous) => {
          if (!previous) return previous;
          const replace = (member: typeof previous.you) =>
            member.id === update.memberId ? { ...member, token: update.token } : member;
          return {
            ...previous,
            members: previous.members.map(replace),
            you: replace(previous.you),
          };
        }),
      );
      connection.on('dice:rolled', (roll) =>
        setSnapshot((previous) =>
          previous
            ? {
                ...previous,
                rolls: [...previous.rolls.filter((item) => item.id !== roll.id), roll].slice(-20),
              }
            : previous,
        ),
      );
      connection.on('tile:updated', (update) =>
        setSnapshot((previous) => {
          if (!previous || previous.panel.id !== update.panelId) return previous;
          const tiles = new Map(previous.panel.tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
          for (const tile of update.tiles) {
            if (tile.terrain === 'empty' && !tile.blocked) tiles.delete(`${tile.x},${tile.y}`);
            else tiles.set(`${tile.x},${tile.y}`, tile);
          }
          return {
            ...previous,
            room: { ...previous.room, updatedAt: update.updatedAt },
            panel: { ...previous.panel, tiles: [...tiles.values()], updatedAt: update.updatedAt },
          };
        }),
      );
      connection.on('disconnect', () => {
        setStatus('Reconnecting');
        paintQueue.current.clear();
      });
      connection.on('connect_error', (error) => {
        setStatus(error.message.includes('session') ? 'Session expired' : 'Reconnecting');
        setError(
          error.message.includes('session')
            ? error.message
            : 'Connection interrupted. Reconnecting automatically…',
        );
      });
    });
    return () => {
      active = false;
      connection?.disconnect();
      socket.current = null;
      if (paintTimer.current) clearTimeout(paintTimer.current);
      queuedPaint.clear();
    };
  }, [code]);

  async function perform<T>(
    action: (connection: Socket<ServerEvents, ClientEvents>) => Promise<Reply<T>>,
    quietMovement = false,
  ): Promise<boolean> {
    if (!socket.current?.connected || status !== 'Connected') {
      setError('Wait for the table to reconnect before editing.');
      return false;
    }
    setPending((value) => value + 1);
    try {
      const result = await action(socket.current);
      if (!result.ok) {
        if (quietMovement && result.code === 'MOVE_REJECTED') return false;
        throw new Error(result.error);
      }
      setError('');
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'The change could not be saved. Try again.',
      );
      return false;
    } finally {
      setPending((value) => Math.max(0, value - 1));
    }
  }
  const paint = (tile: Tile) => {
    if (status !== 'Connected') return;
    paintQueue.current.set(`${tile.x},${tile.y}`, tile);
    if (paintTimer.current) return;
    const panelId = current.current?.panel.id;
    paintTimer.current = setTimeout(() => {
      paintTimer.current = null;
      const tiles = [...paintQueue.current.values()];
      paintQueue.current.clear();
      if (!panelId) return;
      for (let start = 0; start < tiles.length; start += 64)
        void perform((connection) =>
          connection
            .timeout(10000)
            .emitWithAck('tile:paint', { panelId, tiles: tiles.slice(start, start + 64) }),
        );
    }, 35);
  };
  return {
    snapshot,
    status,
    error,
    pending,
    paint,
    clearError: () => setError(''),
    changePanel: (id: string) =>
      perform((connection) => connection.timeout(10000).emitWithAck('panel:change', id)),
    createPanel: (request: SceneRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('panel:create', request)),
    renamePanel: (request: { panelId: string; name: string }) =>
      perform((connection) => connection.timeout(10000).emitWithAck('panel:rename', request)),
    importPanel: (request: unknown) =>
      perform((connection) => connection.timeout(10000).emitWithAck('panel:import', request)),
    updateCharacter: (request: CharacterAppearance) =>
      perform((connection) => connection.timeout(10000).emitWithAck('character:update', request)),
    moveToken: (request: MoveRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('token:move', request), true),
    setMovement: (allowed: boolean) =>
      perform((connection) => connection.timeout(10000).emitWithAck('room:movement', { allowed })),
    setSpawn: (request: SpawnRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('panel:spawn', request)),
    rollDice: (request: DiceRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('dice:roll', request)),
    updateFog: (request: FogRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('fog:update', request)),
    duplicatePanel: (id: string) =>
      perform((connection) => connection.timeout(10000).emitWithAck('panel:duplicate', id)),
    removePanel: (id: string) =>
      perform((connection) => connection.timeout(10000).emitWithAck('panel:remove', id)),
    reorderPanels: (ids: string[]) =>
      perform((connection) => connection.timeout(10000).emitWithAck('panel:reorder', ids)),
  };
}
