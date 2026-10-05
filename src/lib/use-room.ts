'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { forgetTable, hasSavedSession, rememberTable, sessionFor } from './sessions';
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
  CharacterClass,
  HealthAdjustmentRequest,
  StructureRequest,
  PoiConfiguration,
  MonsterDefinition,
  SummonMonsterRequest,
  MonsterMoveRequest,
  MonsterHealthRequest,
  MonsterVisibilityRequest,
  MonsterReference,
  PlayerAttackRequest,
  MonsterAttackRequest,
} from '../types/game';

export function useRoom(code: string) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState('Connecting');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(0);
  const [rollAnimations, setRollAnimations] = useState<Record<string, number>>({});
  const [combatTransition, setCombatTransition] = useState<'enter' | 'exit' | null>(null);
  const socket = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const paintQueue = useRef(new Map<string, Tile>());
  const paintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<Snapshot | null>(null);
  const finishCombatTransition = useCallback(() => setCombatTransition(null), []);

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
    const returnToHub = (reason: 'deleted' | 'left' | 'missing') => {
      if (!active) return;
      active = false;
      try {
        forgetTable(code);
        sessionStorage.setItem('tavern:lifecycle-notice', reason);
      } catch {}
      connection?.disconnect();
      router.replace('/');
    };
    const checkSavedSession = () => {
      if (connection && !hasSavedSession(code)) returnToHub('left');
    };
    window.addEventListener('storage', checkSavedSession);
    window.addEventListener('tavern:tables-changed', checkSavedSession);
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
        if (current.current?.room.activeCombat && !data.room.activeCombat)
          setCombatTransition('exit');
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
      connection.on('room:destroyed', () => returnToHub('deleted'));
      connection.on('session:ended', () => returnToHub('left'));
      connection.on('combat:started', () => setCombatTransition('enter'));
      connection.on('combat:ended', () => setCombatTransition('exit'));
      connection.on('poi:unlinked', () =>
        setNotice('This point of interest has no linked destination scene.'),
      );
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
      connection.on('health:updated', (update) =>
        setSnapshot((previous) => {
          if (!previous) return previous;
          const replace = (member: typeof previous.you) =>
            member.id === update.memberId ? { ...member, health: update.health } : member;
          return {
            ...previous,
            members: previous.members.map(replace),
            you: replace(previous.you),
          };
        }),
      );
      connection.on('dice:rolled', (roll) => {
        const receivedAt = Date.now();
        setRollAnimations((previous) => ({
          ...Object.fromEntries(Object.entries(previous).filter(([, until]) => until > receivedAt)),
          [roll.id]: previous[roll.id] ?? receivedAt + 800,
        }));
        setSnapshot((previous) =>
          previous
            ? {
                ...previous,
                rolls: [...previous.rolls.filter((item) => item.id !== roll.id), roll].slice(-20),
              }
            : previous,
        );
      });
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
        if ((error as Error & { data?: { code: string } }).data?.code === 'ROOM_NOT_FOUND') {
          returnToHub('missing');
          return;
        }
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
      window.removeEventListener('storage', checkSavedSession);
      window.removeEventListener('tavern:tables-changed', checkSavedSession);
      connection?.disconnect();
      socket.current = null;
      if (paintTimer.current) clearTimeout(paintTimer.current);
      queuedPaint.clear();
    };
  }, [code, router]);

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
    rollAnimations,
    combatTransition,
    notice,
    finishCombatTransition,
    paint,
    placeStructure: (request: StructureRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('structure:place', request)),
    configurePoi: (request: PoiConfiguration) =>
      perform((connection) => connection.timeout(10000).emitWithAck('poi:configure', request)),
    voteTravel: (voteId: string, accept: boolean) =>
      perform((connection) =>
        connection.timeout(10000).emitWithAck('poi:vote', { voteId, accept }),
      ),
    decideTravel: (voteId: string, approved: boolean) =>
      perform((connection) =>
        connection.timeout(10000).emitWithAck('poi:gm_decide', { voteId, approved }),
      ),
    deleteRoom: () => perform((connection) => connection.timeout(10000).emitWithAck('room:delete')),
    leaveRoom: () => perform((connection) => connection.timeout(10000).emitWithAck('room:leave')),
    saveMonsterDefinition: (request: MonsterDefinition) =>
      perform((connection) =>
        connection.timeout(10000).emitWithAck('monster:save_definition', request),
      ),
    deleteMonsterDefinition: (id: string) =>
      perform((connection) =>
        connection.timeout(10000).emitWithAck('monster:delete_definition', id),
      ),
    summonMonster: (request: SummonMonsterRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('monster:summon', request)),
    moveMonster: (request: MonsterMoveRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('monster:move', request)),
    adjustMonsterHp: (request: MonsterHealthRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('monster:adjust_hp', request)),
    setMonsterVisibility: (request: MonsterVisibilityRequest) =>
      perform((connection) =>
        connection.timeout(10000).emitWithAck('monster:set_visibility', request),
      ),
    removeMonster: (request: MonsterReference) =>
      perform((connection) => connection.timeout(10000).emitWithAck('monster:remove', request)),
    startCombat: (request: MonsterReference) =>
      perform((connection) => connection.timeout(10000).emitWithAck('combat:start', request)),
    playerAttack: (request: PlayerAttackRequest) =>
      perform((connection) =>
        connection.timeout(10000).emitWithAck('combat:attack_player', request),
      ),
    monsterAttack: (request: MonsterAttackRequest) =>
      perform((connection) =>
        connection.timeout(10000).emitWithAck('combat:attack_monster', request),
      ),
    nextCombatTurn: () =>
      perform((connection) => connection.timeout(10000).emitWithAck('combat:next_turn')),
    endCombat: () => perform((connection) => connection.timeout(10000).emitWithAck('combat:end')),
    clearError: () => {
      setError('');
      setNotice('');
    },
    updateClasses: (classes: CharacterClass[]) =>
      perform((connection) => connection.timeout(10000).emitWithAck('room:classes', { classes })),
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
    adjustHealth: (request: HealthAdjustmentRequest) =>
      perform((connection) => connection.timeout(10000).emitWithAck('health:update', request)),
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
