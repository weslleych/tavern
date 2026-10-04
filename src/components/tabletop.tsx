'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Crown,
  Download,
  Grid2X2,
  Hand,
  Layers,
  Leaf,
  LoaderCircle,
  Map,
  Menu,
  Paintbrush,
  Pencil,
  Plus,
  Shield,
  Upload,
  Users,
  X,
  ArrowUp,
  ArrowDown,
  Dices,
  Eye,
  EyeOff,
  Footprints,
  Trash2,
  UserRound,
  Flag,
  LockKeyhole,
  UnlockKeyhole,
} from 'lucide-react';
import { Brand } from './ui/brand';
import { Modal } from './ui/modal';
import { FormSelect } from './ui/select';
import { LanguageSwitcher } from './ui/language-switcher';
import { useClassCatalog } from '../i18n/use-class-catalog';
import { useErrorMessage } from '../i18n/use-error-message';
import { CharacterCreator, CharacterPortrait } from './character-creator';
import { DiceSidebar } from './dice-sidebar';
import { ClassManager } from './class-manager';
import { HealthStatus } from './health-status';
import { HealthEditor } from './health-editor';
import { MapCanvas } from './canvas/map-canvas';
import { drawTile } from './canvas/render';
import { terrainInfo } from '../lib/terrain';
import { useRoom } from '../lib/use-room';
import { characterClassTitle } from '../lib/classes';
import { useMediaQuery } from '../lib/use-media-query';
import { importSchema, readableError, spriteSchema } from '../lib/validation';
import { terrains, type Terrain, type MapTool } from '../types/game';

function TerrainSwatch({ terrain }: { terrain: Terrain }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawTile(ctx, terrain, 0, 0, 32);
  }, [terrain]);
  return <canvas width={32} height={32} ref={ref} aria-hidden="true" className="terrain-swatch" />;
}

export function Tabletop({ code }: { code: string }) {
  const t = useTranslations();
  const formatError = useErrorMessage();
  const room = useRoom(code);
  const { snapshot, status, pending } = room;
  const displayClasses = useClassCatalog(snapshot?.room.classes ?? []);
  const statusLabel = t(
    `tabletop.connection.${({ Connecting: 'connecting', Connected: 'connected', Reconnecting: 'reconnecting', 'Join this table': 'join', 'Session expired': 'expired' } as Record<string, string>)[status]}`,
  );
  const [terrain, setTerrain] = useState<Terrain>('grass');
  const [blocked, setBlocked] = useState(false);
  const [tool, setTool] = useState<MapTool>('paint');
  const [grid, setGrid] = useState(true);
  const [collisions, setCollisions] = useState(false);
  const [dialog, setDialog] = useState<'new' | 'rename' | 'help' | 'character' | 'remove' | null>(
    null,
  );
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [classManagerOpen, setClassManagerOpen] = useState(false);
  const mobileDice = useMediaQuery('(max-width: 979px)');
  const [desktopDiceOpen, setDesktopDiceOpen] = useState(true);
  const [mobileDiceOpen, setMobileDiceOpen] = useState(false);
  const diceOpen = mobileDice ? mobileDiceOpen : desktopDiceOpen;
  const setDiceOpen = mobileDice ? setMobileDiceOpen : setDesktopDiceOpen;
  const [sprite, setSprite] = useState<string | undefined>();
  const spriteRef = useRef<HTMLInputElement>(null);
  const [sidebar, setSidebar] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>();
  const [healthMemberId, setHealthMemberId] = useState<string>();
  const importRef = useRef<HTMLInputElement>(null);
  const isGM = snapshot?.you.role === 'gm';
  const canEdit = isGM && status === 'Connected';
  const playersCanMove = snapshot?.room.playersCanMove !== false;
  const selectedPlayer = snapshot?.members.find(
    (member) => member.id === selectedMemberId && member.role === 'player',
  );
  const healthMember = snapshot?.members.find(
    (member) => member.id === healthMemberId && member.role === 'player',
  );
  const hudMember = isGM ? selectedPlayer : snapshot?.you;
  const healthBusy = status !== 'Connected' || pending > 0;

  function chooseTerrain(next: Terrain) {
    setTerrain(next);
    setTool('paint');
    setBlocked(['forest', 'water', 'mountain', 'wall'].includes(next));
  }
  useEffect(() => {
    function key(event: globalThis.KeyboardEvent) {
      if (
        (event.target as HTMLElement).closest(
          'input, textarea, select, dialog, [role="combobox"], [role="listbox"]',
        ) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const index = event.key === '0' ? 9 : Number(event.key) - 1;
      if (index >= 0 && index < terrains.length && isGM) {
        const next = terrains[index];
        setTerrain(next);
        setTool('paint');
        setBlocked(['forest', 'water', 'mountain', 'wall'].includes(next));
      }
      if (event.key.toLowerCase() === 'h') setTool('pan');
      if (event.key.toLowerCase() === 'b' && isGM) setTool('paint');
      if (event.key.toLowerCase() === 'm') setTool('move');
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [isGM]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?join=${code}`);
      setNotice(t('tabletop.inviteCopied'));
    } catch {
      setLocalError(t('tabletop.copyCode', { code }));
    }
  }
  async function sceneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name'));
    const success =
      dialog === 'rename' && snapshot
        ? await room.renamePanel({ panelId: snapshot.panel.id, name })
        : await room.createPanel({
            name,
            cols: Number(form.get('cols')),
            rows: Number(form.get('rows')),
            template: form.get('template') as 'blank' | 'woodland',
          });
    if (success) {
      setDialog(null);
      setNotice(t(dialog === 'rename' ? 'tabletop.sceneRenamed' : 'tabletop.sceneReady'));
    }
  }
  function exportMap() {
    if (!snapshot) return;
    const { name, grid, tiles } = snapshot.panel;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, name, grid, tiles }, null, 2)], {
        type: 'application/json',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'tavern-map'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(t('tabletop.mapExported'));
  }
  async function importMap(file?: File) {
    if (!file) return;
    try {
      if (file.size > 512 * 1024) throw new Error('Choose a JSON map smaller than 512 KB.');
      const data: unknown = JSON.parse(await file.text());
      const valid = importSchema.parse(data);
      if (await room.importPanel(valid)) setNotice(t('tabletop.mapImported'));
    } catch (error) {
      setLocalError(
        error instanceof SyntaxError
          ? 'This file is not valid JSON. Choose a Tavern map export.'
          : readableError(error),
      );
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }
  async function importSprite(file?: File) {
    if (!file) return;
    try {
      if (file.type !== 'image/png' || file.size > 256 * 1024)
        throw new Error('Choose a PNG up to 256 KB.');
      const image = await createImageBitmap(file);
      try {
        if (image.width > 128 || image.height > 128)
          throw new Error('Choose a sprite up to 128 × 128 pixels.');
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Your browser could not load this sprite.');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0, 32, 32);
        setSprite(spriteSchema.parse(canvas.toDataURL('image/png')));
        setTool('paint');
        setNotice(t('tabletop.spriteReady'));
      } finally {
        image.close();
      }
    } catch (error) {
      setLocalError(readableError(error));
    } finally {
      if (spriteRef.current) spriteRef.current.value = '';
    }
  }
  function reorderScene(index: number, delta: number) {
    if (!snapshot) return;
    const ids = snapshot.panels.map((panel) => panel.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void room.reorderPanels(ids);
  }

  if (!snapshot)
    return (
      <div className="entry-page">
        <Brand />
        <div className="entry-card">
          {status === 'Connecting' || status === 'Reconnecting' ? (
            <>
              <LoaderCircle size={30} className="spin" />
              <h1>{t('tabletop.findingTable')}</h1>
              <p>{formatError(room.error) || t('tabletop.settingScene')}</p>
            </>
          ) : (
            <>
              <Map size={34} />
              <h1>
                {status === 'Session expired' ? t('tabletop.findSeat') : t('tabletop.seatForYou')}
              </h1>
              <p>{formatError(room.error)}</p>
            </>
          )}
          <Link className="button primary" href={`/?join=${code}`}>
            {status === 'Connecting' ? t('common.backToTavern') : t('tabletop.connection.join')}
            <ChevronRight size={17} />
          </Link>
        </div>
      </div>
    );

  if (!isGM && !snapshot.you.character)
    return (
      <main className="character-gate" id="main-content">
        <div className="character-gate-nav">
          <Brand />
          <LanguageSwitcher />
          <span className="connection">
            <span className="live-dot" />
            <span data-testid="connection-status">{statusLabel}</span>
          </span>
        </div>
        <section className="character-gate-card">
          <span className="eyebrow">{snapshot.room.name}</span>
          <h1>{t('tabletop.createAdventurer')}</h1>
          <CharacterCreator
            classes={snapshot.room.classes}
            nickname={snapshot.you.nickname}
            busy={status !== 'Connected' || pending > 0}
            error={room.error}
            onSave={room.updateCharacter}
          />
          <Link href="/" className="tables-link">
            <ArrowLeft size={15} /> {t('common.yourTables')}
          </Link>
        </section>
      </main>
    );

  return (
    <div className="room-shell">
      <header className="room-nav">
        <div className="room-nav-left">
          <Brand small />
          <span className="nav-divider" />
          <Link href="/" className="tables-link">
            <ArrowLeft size={15} /> {t('common.yourTables')}
          </Link>
          <ChevronRight size={14} className="breadcrumb-arrow" />
          <span className="room-name">{snapshot.room.name}</span>
        </div>
        <div className="room-nav-right">
          <LanguageSwitcher />
          {isGM && (
            <button
              className="button secondary manage-classes-button"
              disabled={!canEdit}
              onClick={() => setClassManagerOpen(true)}
              aria-label={t('tabletop.manageClasses')}
            >
              <Shield size={16} aria-hidden="true" />
              <span>{t('tabletop.classes')}</span>
            </button>
          )}
          <span className={`connection ${status !== 'Connected' ? 'connection-offline' : ''}`}>
            <span className="live-dot" />
            <span data-testid="connection-status">{statusLabel}</span>
          </span>
          <button
            className="button invite-button"
            onClick={copyInvite}
            aria-label={t('tabletop.inviteFriends')}
            title={t('tabletop.inviteFriends')}
          >
            <Users size={16} aria-hidden="true" /> <span>{t('tabletop.inviteFriends')}</span>
          </button>
          {isGM ? (
            <span
              className="self-avatar"
              title={`${snapshot.you.nickname} · ${t('common.gameMaster')}`}
            >
              <Crown size={20} aria-label={t('common.gameMaster')} />
            </span>
          ) : (
            snapshot.you.character && (
              <button
                className="self-avatar"
                title={snapshot.you.nickname}
                aria-label={t('tabletop.editCharacter')}
                onClick={() => setDialog('character')}
              >
                <CharacterPortrait appearance={snapshot.you.character} />
              </button>
            )
          )}
        </div>
      </header>
      <div className="room-body">
        <aside
          className={`scene-sidebar ${sidebar ? 'sidebar-open' : ''}`}
          aria-label={t('tabletop.scenesAndPlayers')}
        >
          <div className="sidebar-heading">
            <span>
              <Layers size={18} /> {t('tabletop.yourWorld')}
            </span>
            <button
              className="icon-button sidebar-close"
              onClick={() => setSidebar(false)}
              aria-label={t('tabletop.closeScenes')}
            >
              <X size={17} />
            </button>
          </div>
          <LanguageSwitcher />
          <div className="scene-list-heading">
            <span>{t('tabletop.scenes')}</span>
            <span>{snapshot.panels.length}</span>
          </div>
          <div className="scene-list">
            {snapshot.panels.map((panel, index) => (
              <div className="scene-row" key={panel.id}>
                <button
                  disabled={!canEdit}
                  className={`scene-item ${panel.id === snapshot.panel.id ? 'active' : ''}`}
                  onClick={() => {
                    void room.changePanel(panel.id);
                    setSidebar(false);
                  }}
                  aria-current={panel.id === snapshot.panel.id ? 'true' : undefined}
                >
                  <span className="scene-thumbnail">
                    <Map size={20} />
                  </span>
                  <span>
                    <strong>{panel.name}</strong>
                    <small>
                      {panel.grid.cols} × {panel.grid.rows} {t('tabletop.tiles')}
                    </small>
                  </span>
                  <span className="scene-number">{String(index + 1).padStart(2, '0')}</span>
                </button>
                {isGM && (
                  <div className="scene-order-controls">
                    <button
                      className="icon-button"
                      aria-label={t('tabletop.moveSceneUp')}
                      disabled={!canEdit || index === 0}
                      onClick={() => reorderScene(index, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t('tabletop.moveSceneDown')}
                      disabled={!canEdit || index === snapshot.panels.length - 1}
                      onClick={() => reorderScene(index, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {isGM && (
            <button className="new-scene" onClick={() => setDialog('new')} disabled={!canEdit}>
              <Plus size={17} /> {t('tabletop.newScene')}
            </button>
          )}
          {isGM && (
            <div className="scene-manage-actions">
              <button
                className="button secondary"
                aria-label={t('tabletop.duplicateScene')}
                disabled={!canEdit || snapshot.panels.length >= 30}
                onClick={() => void room.duplicatePanel(snapshot.panel.id)}
              >
                <Copy size={15} /> {t('tabletop.duplicate')}
              </button>
              <button
                className="icon-button"
                aria-label={t('tabletop.removeCurrentScene')}
                disabled={!canEdit || snapshot.panels.length <= 1}
                onClick={() => {
                  setRemoveTarget({ id: snapshot.panel.id, name: snapshot.panel.name });
                  setDialog('remove');
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
          {!isGM && (
            <p className="player-note">
              <Shield size={14} /> {t('tabletop.gmChoosesScene')}
            </p>
          )}
          <div className="party-section">
            <div className="scene-list-heading">
              <span>{t('tabletop.party')}</span>
              <span>
                {snapshot.members.length} {t('tabletop.online')}
              </span>
            </div>
            <ul className="member-list" data-testid="member-list">
              {snapshot.members.map((member, index) => (
                <li key={member.id}>
                  <button
                    className={`member-avatar avatar-${index % 4}`}
                    disabled={member.role === 'gm' || (!isGM && member.id !== snapshot.you.id)}
                    aria-label={
                      member.role === 'gm'
                        ? t('tabletop.gmNickname', { nickname: member.nickname })
                        : isGM
                          ? t('tabletop.moveNickname', { nickname: member.nickname })
                          : member.id === snapshot.you.id && !isGM
                            ? t('tabletop.customizeAdventurer')
                            : t('tabletop.characterNickname', { nickname: member.nickname })
                    }
                    aria-pressed={
                      isGM && member.role === 'player' ? selectedMemberId === member.id : undefined
                    }
                    onClick={() => {
                      if (isGM && member.role === 'player') {
                        setSelectedMemberId(member.id);
                        setTool('move');
                        setSidebar(false);
                      } else if (!isGM) setDialog('character');
                    }}
                  >
                    {member.role === 'gm' ? (
                      <Crown size={17} aria-hidden="true" />
                    ) : member.character ? (
                      <CharacterPortrait appearance={member.character} />
                    ) : (
                      member.nickname[0].toUpperCase()
                    )}
                    <span className="member-online" />
                  </button>
                  <span>
                    <strong>
                      {member.nickname}
                      {member.id === snapshot.you.id && <small> {t('tabletop.you')}</small>}
                    </strong>
                    <small>
                      {member.role === 'gm' ? t('common.gameMaster') : t('common.player')}
                    </small>
                    {member.role === 'player' &&
                      characterClassTitle(displayClasses, member.character) && (
                        <small className="member-class-title">
                          {characterClassTitle(displayClasses, member.character)}
                        </small>
                      )}
                    {member.role === 'player' &&
                      member.health &&
                      (isGM || member.id === snapshot.you.id ? (
                        <button
                          className="health-trigger"
                          aria-label={t('tabletop.adjustHealth', { nickname: member.nickname })}
                          aria-haspopup="dialog"
                          disabled={healthBusy}
                          onClick={() => setHealthMemberId(member.id)}
                        >
                          <HealthStatus health={member.health} nickname={member.nickname} />
                        </button>
                      ) : (
                        <HealthStatus health={member.health} nickname={member.nickname} />
                      ))}
                  </span>
                  {member.role === 'gm' && <Crown size={15} className="crown" />}
                </li>
              ))}
            </ul>
          </div>
          <div className="sidebar-bottom">
            <div className="table-code">
              <span>{t('hub.tableCode')}</span>
              <button onClick={copyInvite} title={t('tabletop.copyInvite')}>
                {code}
                <Copy size={13} />
              </button>
            </div>
            <div className="map-file-actions">
              <button onClick={exportMap}>
                <Download size={15} /> {t('tabletop.exportMap')}
              </button>
              {isGM && (
                <button disabled={!canEdit} onClick={() => importRef.current?.click()}>
                  <Upload size={15} /> {t('tabletop.importMap')}
                </button>
              )}
            </div>
            <input
              type="file"
              accept=".json,application/json"
              ref={importRef}
              className="sr-only"
              tabIndex={-1}
              aria-label={t('tabletop.importFile')}
              onChange={(event) => void importMap(event.target.files?.[0])}
            />
            <div className="sidebar-brand-note">
              <Leaf size={13} /> {t('tabletop.worldTogether')}
            </div>
          </div>
        </aside>
        {sidebar && (
          <button
            className="sidebar-backdrop"
            onClick={() => setSidebar(false)}
            aria-label={t('tabletop.closeSidebar')}
          />
        )}
        <main className="table-main" id="main-content">
          <div className="scene-toolbar">
            <div className="scene-title-group">
              <button
                className="icon-button mobile-scenes"
                aria-label={t('tabletop.openScenes')}
                onClick={() => setSidebar(true)}
              >
                <Menu size={20} />
              </button>
              <span className="scene-title-icon">
                <Map size={18} />
              </span>
              <h1 data-testid="scene-title">{snapshot.panel.name}</h1>
              {isGM && (
                <button
                  className="icon-button rename-button"
                  aria-label={t('tabletop.renameCurrentScene')}
                  onClick={() => setDialog('rename')}
                  disabled={!canEdit}
                >
                  <Pencil size={13} />
                </button>
              )}
              <span className="live-scene">{t('tabletop.liveScene')}</span>
            </div>
            <div className="scene-toolbar-actions">
              <span className="save-state" role="status">
                {pending ? (
                  <LoaderCircle size={13} className="spin" />
                ) : status === 'Connected' && !room.error ? (
                  <Check size={14} />
                ) : (
                  <Shield size={14} />
                )}
                {pending
                  ? t('common.saving')
                  : status !== 'Connected'
                    ? t('tabletop.waitingConnection')
                    : room.error
                      ? t('tabletop.checkLastChange')
                      : t('tabletop.allChangesSaved')}
              </span>
              <button
                className="icon-button"
                onClick={() => setDialog('help')}
                aria-label={t('tabletop.mapHelp')}
              >
                <CircleHelp size={18} />
              </button>
            </div>
          </div>
          {(room.error || localError) && (
            <div role="alert" className="room-error">
              <span>{formatError(localError || room.error)}</span>
              <button
                className="icon-button"
                aria-label={t('tabletop.dismissError')}
                onClick={() => {
                  setLocalError('');
                  room.clearError();
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="map-workspace">
            <div className="map-top-tools">
              <div className="tool-switch">
                {isGM && (
                  <button
                    aria-label={t('tabletop.paintTool')}
                    aria-pressed={tool === 'paint'}
                    onClick={() => setTool('paint')}
                    disabled={!canEdit}
                    title={t('tabletop.paintShortcut')}
                  >
                    <Paintbrush size={17} />
                  </button>
                )}
                <button
                  aria-label={t('tabletop.panTool')}
                  aria-pressed={tool === 'pan'}
                  onClick={() => setTool('pan')}
                  title={t('tabletop.panShortcut')}
                >
                  <Hand size={17} />
                </button>
                <button
                  aria-label={isGM ? t('tabletop.movePlayers') : t('tabletop.moveCharacter')}
                  aria-pressed={tool === 'move' || (!isGM && tool !== 'pan')}
                  onClick={() => setTool('move')}
                  title={t('tabletop.moveShortcut')}
                >
                  <Footprints size={17} />
                </button>
                {isGM && (
                  <>
                    <button
                      aria-label={t('tabletop.allowMovement')}
                      aria-pressed={playersCanMove}
                      disabled={!canEdit || pending > 0}
                      onClick={() => void room.setMovement(!playersCanMove)}
                      title={
                        playersCanMove ? t('tabletop.pauseMovement') : t('tabletop.allowMovement')
                      }
                    >
                      {playersCanMove ? <UnlockKeyhole size={17} /> : <LockKeyhole size={17} />}
                    </button>
                    <button
                      aria-label={t('tabletop.setSpawn')}
                      aria-pressed={tool === 'spawn'}
                      disabled={!canEdit}
                      onClick={() => setTool('spawn')}
                      title={t('tabletop.chooseSpawn')}
                    >
                      <Flag size={17} />
                    </button>
                    <button
                      aria-label={t('tabletop.toggleFog')}
                      aria-pressed={!!snapshot.panel.fog?.enabled}
                      disabled={!canEdit}
                      onClick={() =>
                        void room.updateFog({
                          panelId: snapshot.panel.id,
                          enabled: !snapshot.panel.fog?.enabled,
                        })
                      }
                      title={t('tabletop.fog')}
                    >
                      <EyeOff size={17} />
                    </button>
                    {snapshot.panel.fog?.enabled && (
                      <>
                        <button
                          aria-label={t('tabletop.revealFog')}
                          aria-pressed={tool === 'reveal'}
                          disabled={!canEdit}
                          onClick={() => setTool('reveal')}
                          title={t('tabletop.revealTiles')}
                        >
                          <Eye size={17} />
                        </button>
                        <button
                          aria-label={t('tabletop.hideTiles')}
                          aria-pressed={tool === 'hide'}
                          disabled={!canEdit}
                          onClick={() => setTool('hide')}
                          title={t('tabletop.hideTiles')}
                        >
                          <EyeOff size={17} />
                        </button>
                      </>
                    )}
                  </>
                )}
                <span />
                <button
                  aria-label={t('tabletop.toggleGrid')}
                  aria-pressed={grid}
                  onClick={() => setGrid(!grid)}
                >
                  <Grid2X2 size={17} />
                </button>
                <button
                  aria-label={t('tabletop.openDice')}
                  aria-expanded={diceOpen}
                  aria-controls="dice-sidebar"
                  onClick={() => {
                    setSidebar(false);
                    setDiceOpen((open) => !open);
                  }}
                >
                  <Dices size={17} />
                </button>
              </div>
              {isGM ? (
                <span className="role-tag">
                  <Crown size={13} /> {t('common.gameMaster')}
                </span>
              ) : (
                <span className="role-tag">
                  <Users size={13} /> {t('tabletop.playerView')}
                </span>
              )}
            </div>
            <MapCanvas
              key={snapshot.panel.id}
              panel={snapshot.panel}
              terrain={terrain}
              blocked={blocked}
              canEdit={!!canEdit}
              tool={isGM ? tool : tool === 'pan' ? 'pan' : 'move'}
              gridVisible={grid}
              collisionsVisible={isGM && collisions}
              onPaint={room.paint}
              members={snapshot.members}
              you={snapshot.you}
              canMove={status === 'Connected' && (isGM || playersCanMove)}
              selectedMemberId={selectedMemberId}
              onSelectMember={setSelectedMemberId}
              sprite={sprite}
              onMove={room.moveToken}
              onSpawn={(point) => room.setSpawn({ panelId: snapshot.panel.id, point })}
              onFog={(cells, revealed) =>
                room.updateFog({ panelId: snapshot.panel.id, cells, revealed })
              }
            />
            <div className="map-hud-stack">
              <div className="character-hud">
                {!isGM && snapshot.you.character && (
                  <button
                    aria-label={t('tabletop.customizeCharacter')}
                    onClick={() => setDialog('character')}
                  >
                    <CharacterPortrait appearance={snapshot.you.character} size={32} />
                    <UserRound size={14} />
                  </button>
                )}
                {isGM && <Crown size={16} />}
                <span data-testid="token-position" role="status">
                  {isGM
                    ? selectedPlayer?.token
                      ? t('tabletop.playerPosition', {
                          nickname: selectedPlayer.nickname,
                          x: selectedPlayer.token.x + 1,
                          y: selectedPlayer.token.y + 1,
                        })
                      : t('tabletop.selectPlayer')
                    : snapshot.you.token
                      ? t('tabletop.position', {
                          x: snapshot.you.token.x + 1,
                          y: snapshot.you.token.y + 1,
                        })
                      : t('tabletop.waitingTile')}
                </span>
                {!isGM && characterClassTitle(displayClasses, snapshot.you.character) && (
                  <span className="member-class-title">
                    {characterClassTitle(displayClasses, snapshot.you.character)}
                  </span>
                )}
                {hudMember?.health && (
                  <>
                    <button
                      className="health-trigger"
                      aria-haspopup="dialog"
                      aria-label={
                        isGM
                          ? t('tabletop.openHealth', { nickname: hudMember.nickname })
                          : t('tabletop.adjustYourHealth')
                      }
                      disabled={healthBusy}
                      onClick={() => setHealthMemberId(hudMember.id)}
                    >
                      <HealthStatus health={hudMember.health} nickname={hudMember.nickname} />
                    </button>
                    {isGM &&
                      [-1, 1].map((delta) => (
                        <button
                          className="health-step"
                          key={delta}
                          disabled={healthBusy}
                          aria-label={t('tabletop.healthStep', {
                            action: delta < 0 ? t('tabletop.damage') : t('tabletop.heal'),
                            nickname: hudMember.nickname,
                          })}
                          onClick={() => void room.adjustHealth({ memberId: hudMember.id, delta })}
                        >
                          {delta < 0 ? '−' : '+'}
                        </button>
                      ))}
                  </>
                )}
              </div>
              {isGM && (
                <div className="gm-scene-controls">
                  <span>
                    {playersCanMove ? t('tabletop.freeMovement') : t('tabletop.pausedMovement')}
                  </span>
                  <span data-testid="spawn-position">
                    <Flag size={13} />{' '}
                    {snapshot.panel.spawnPoint
                      ? t('tabletop.spawnPosition', {
                          x: snapshot.panel.spawnPoint.x + 1,
                          y: snapshot.panel.spawnPoint.y + 1,
                        })
                      : t('tabletop.noSpawn')}
                  </span>
                  {snapshot.panel.spawnPoint && (
                    <button
                      disabled={!canEdit}
                      aria-label={t('tabletop.clearSpawn')}
                      onClick={() =>
                        void room.setSpawn({ panelId: snapshot.panel.id, point: null })
                      }
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
            {isGM && tool === 'paint' && (
              <div className="brush-dock">
                <div className="brush-heading">
                  <span>
                    <Paintbrush size={14} /> {t('tabletop.terrainPalette')}
                  </span>
                  <small>{t('tabletop.paintHint')}</small>
                </div>
                <div className="terrain-palette">
                  {terrains.map((next) => (
                    <button
                      key={next}
                      aria-label={t(`tabletop.terrain.${next}`)}
                      aria-pressed={terrain === next && tool === 'paint'}
                      disabled={!canEdit}
                      onClick={() => chooseTerrain(next)}
                      title={`${t(`tabletop.terrain.${next}`)} (${terrainInfo[next].shortcut})`}
                    >
                      <TerrainSwatch terrain={next} />
                      <span>{t(`tabletop.terrain.${next}`)}</span>
                    </button>
                  ))}
                </div>
                <div className="brush-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={blocked}
                      disabled={terrain === 'empty' || !canEdit}
                      onChange={(event) => setBlocked(event.target.checked)}
                    />
                    <Shield size={13} /> {t('tabletop.blockMovement')}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={collisions}
                      onChange={(event) => setCollisions(event.target.checked)}
                    />
                    {t('tabletop.showBlocked')}
                  </label>
                  <span className="brush-current">{t(`tabletop.terrain.${terrain}`)}</span>
                </div>
                <div className="sprite-options">
                  <button
                    className="button secondary"
                    disabled={!canEdit}
                    onClick={() => spriteRef.current?.click()}
                  >
                    <Upload size={14} />{' '}
                    {sprite ? t('tabletop.replaceSprite') : t('tabletop.customSprite')}
                  </button>
                  {sprite && (
                    <button className="button secondary" onClick={() => setSprite(undefined)}>
                      {t('tabletop.clearSprite')}
                    </button>
                  )}
                  <input
                    type="file"
                    ref={spriteRef}
                    accept="image/png,.png"
                    aria-label={t('tabletop.spriteFile')}
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(event) => void importSprite(event.target.files?.[0])}
                  />
                </div>
              </div>
            )}
            {!isGM && (
              <div className="player-view-note">
                <Footprints size={15} />{' '}
                {playersCanMove ? t('tabletop.playerMovementHint') : t('tabletop.pausedByGM')}
              </div>
            )}
          </div>
          <footer className="map-status-bar">
            <span>
              <span className="live-dot" />{' '}
              {isGM ? t('tabletop.worldStory') : t('tabletop.teamAdventure')}
            </span>
            <span data-testid="tile-count">
              {snapshot.panel.tiles.length} {t('tabletop.tiles')}
            </span>
            <span>{isGM ? t('tabletop.gmShortcuts') : t('tabletop.playerShortcuts')}</span>
          </footer>
        </main>
        <DiceSidebar
          classes={snapshot.room.classes}
          character={snapshot.you.character}
          rolls={snapshot.rolls}
          rollAnimations={room.rollAnimations}
          open={diceOpen}
          mobile={mobileDice}
          disabled={status !== 'Connected'}
          onRoll={room.rollDice}
          onClose={() => setDiceOpen(false)}
        />
      </div>
      {classManagerOpen && isGM && (
        <ClassManager
          classes={snapshot.room.classes}
          busy={!canEdit || pending > 0}
          error={room.error}
          onSave={room.updateClasses}
          onClose={() => setClassManagerOpen(false)}
        />
      )}
      {healthMember?.health && (isGM || healthMember.id === snapshot.you.id) && (
        <HealthEditor
          memberId={healthMember.id}
          nickname={healthMember.nickname}
          health={healthMember.health}
          isGM={!!isGM}
          busy={healthBusy}
          error={room.error}
          onAdjust={room.adjustHealth}
          onClose={() => setHealthMemberId(undefined)}
        />
      )}
      {notice && (
        <div role="status" className="toast">
          <Check size={17} />
          {notice}
        </div>
      )}
      {dialog && (
        <Modal
          title={
            dialog === 'new'
              ? t('tabletop.setNewScene')
              : dialog === 'rename'
                ? t('tabletop.renameScene')
                : dialog === 'character'
                  ? t('common.yourAdventurer')
                  : dialog === 'remove'
                    ? t('tabletop.removeSceneTitle')
                    : t('tabletop.helpTitle')
          }
          onClose={() => setDialog(null)}
        >
          {dialog === 'character' ? (
            <CharacterCreator
              classes={snapshot.room.classes}
              initial={snapshot.you.character}
              nickname={snapshot.you.nickname}
              busy={status !== 'Connected' || pending > 0}
              error={room.error}
              editing
              onSave={async (appearance) => {
                const saved = await room.updateCharacter(appearance);
                if (saved) setDialog(null);
                return saved;
              }}
            />
          ) : dialog === 'remove' ? (
            <>
              <p className="modal-description">
                {t('tabletop.removeDescription', { name: removeTarget?.name ?? '' })}
              </p>
              {room.error && (
                <p role="alert" className="form-error">
                  {formatError(room.error)}
                </p>
              )}
              <div className="modal-actions">
                <button className="button secondary" onClick={() => setDialog(null)}>
                  {t('common.cancel')}
                </button>
                <button
                  className="button primary"
                  disabled={!canEdit || pending > 0}
                  onClick={async () => {
                    if (removeTarget && (await room.removePanel(removeTarget.id))) setDialog(null);
                  }}
                >
                  {t('tabletop.removeScene')}
                </button>
              </div>
            </>
          ) : dialog === 'help' ? (
            <div className="help-content">
              <p>{t('tabletop.helpSync')}</p>
              <dl>
                <div>
                  <dt>{t('tabletop.paint')}</dt>
                  <dd>{t('tabletop.helpPaint')}</dd>
                </div>
                <div>
                  <dt>{t('tabletop.pan')}</dt>
                  <dd>{t('tabletop.helpPan')}</dd>
                </div>
                <div>
                  <dt>{t('tabletop.zoom')}</dt>
                  <dd>{t('tabletop.helpZoom')}</dd>
                </div>
                <div>
                  <dt>{t('tabletop.keyboard')}</dt>
                  <dd>{t('tabletop.helpKeyboard')}</dd>
                </div>
                <div>
                  <dt>{t('tabletop.movementAndSpawn')}</dt>
                  <dd>{t('tabletop.helpMovement')}</dd>
                </div>
                <div>
                  <dt>{t('tabletop.fog')}</dt>
                  <dd>{t('tabletop.helpFog')}</dd>
                </div>
                <div>
                  <dt>{t('tabletop.dice')}</dt>
                  <dd>{t('tabletop.helpDice')}</dd>
                </div>
                <div>
                  <dt>{t('tabletop.invite')}</dt>
                  <dd>{t('tabletop.helpInvite')}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <form onSubmit={sceneSubmit}>
              <p className="modal-description">
                {dialog === 'new'
                  ? t('tabletop.newSceneDescription')
                  : t('tabletop.renameDescription')}
              </p>
              <label>
                {t('tabletop.sceneName')}{' '}
                <input
                  name="name"
                  required
                  maxLength={60}
                  autoFocus
                  defaultValue={dialog === 'rename' ? snapshot.panel.name : ''}
                  placeholder={t('tabletop.scenePlaceholder')}
                />
              </label>
              {dialog === 'new' && (
                <>
                  <div className="form-row">
                    <label>
                      {t('tabletop.columns')}{' '}
                      <input
                        type="number"
                        name="cols"
                        min={5}
                        max={64}
                        defaultValue={26}
                        required
                      />
                    </label>
                    <label>
                      {t('tabletop.rows')}{' '}
                      <input
                        type="number"
                        name="rows"
                        min={5}
                        max={64}
                        defaultValue={18}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    {t('tabletop.startingTerrain')}{' '}
                    <FormSelect
                      label={t('tabletop.startingTerrain')}
                      name="template"
                      defaultValue="blank"
                      options={[
                        { value: 'blank', label: t('tabletop.blankCanvas') },
                        { value: 'woodland', label: t('tabletop.woodlandClearing') },
                      ]}
                    />
                  </label>
                </>
              )}
              {room.error && (
                <p role="alert" className="form-error">
                  {formatError(room.error)}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setDialog(null)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="button primary" disabled={pending > 0 || !canEdit}>
                  {pending > 0 && <LoaderCircle className="spin" size={16} />}
                  {dialog === 'new' ? t('tabletop.createScene') : t('tabletop.saveName')}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
