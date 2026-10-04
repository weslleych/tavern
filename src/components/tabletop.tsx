'use client';

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
} from 'lucide-react';
import { Brand } from './ui/brand';
import { Modal } from './ui/modal';
import { MapCanvas } from './canvas/map-canvas';
import { drawTile } from './canvas/render';
import { terrainInfo } from '../lib/terrain';
import { useRoom } from '../lib/use-room';
import { importSchema, readableError } from '../lib/validation';
import { terrains, type Terrain } from '../types/game';

function TerrainSwatch({ terrain }: { terrain: Terrain }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawTile(ctx, terrain, 0, 0, 32);
  }, [terrain]);
  return <canvas width={32} height={32} ref={ref} aria-hidden="true" className="terrain-swatch" />;
}

export function Tabletop({ code }: { code: string }) {
  const room = useRoom(code);
  const { snapshot, status, pending } = room;
  const [terrain, setTerrain] = useState<Terrain>('grass');
  const [blocked, setBlocked] = useState(false);
  const [tool, setTool] = useState<'paint' | 'pan'>('paint');
  const [grid, setGrid] = useState(true);
  const [collisions, setCollisions] = useState(false);
  const [dialog, setDialog] = useState<'new' | 'rename' | 'help' | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const isGM = snapshot?.you.role === 'gm';
  const canEdit = isGM && status === 'Connected';

  function chooseTerrain(next: Terrain) {
    setTerrain(next);
    setTool('paint');
    setBlocked(['forest', 'water', 'mountain', 'wall'].includes(next));
  }
  useEffect(() => {
    function key(event: globalThis.KeyboardEvent) {
      if (
        (event.target as HTMLElement).closest('input, textarea, select, dialog') ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < terrains.length && isGM) {
        const next = terrains[index];
        setTerrain(next);
        setTool('paint');
        setBlocked(['forest', 'water', 'mountain', 'wall'].includes(next));
      }
      if (event.key.toLowerCase() === 'h') setTool('pan');
      if (event.key.toLowerCase() === 'b' && isGM) setTool('paint');
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
      setNotice('Invite link copied. Send it to your party.');
    } catch {
      setLocalError(`Copy this table code and send it to your party: ${code}`);
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
      setNotice(dialog === 'rename' ? 'Scene renamed.' : 'Your new scene is ready.');
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
    setNotice('Map exported. Keep it for your next adventure.');
  }
  async function importMap(file?: File) {
    if (!file) return;
    try {
      if (file.size > 512 * 1024) throw new Error('Choose a JSON map smaller than 512 KB.');
      const data: unknown = JSON.parse(await file.text());
      const valid = importSchema.parse(data);
      if (await room.importPanel(valid)) setNotice('Map imported as a new scene.');
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

  if (!snapshot)
    return (
      <div className="entry-page">
        <Brand />
        <div className="entry-card">
          {status === 'Connecting' || status === 'Reconnecting' ? (
            <>
              <LoaderCircle size={30} className="spin" />
              <h1>Finding your table…</h1>
              <p>{room.error || 'Setting the scene for your next adventure.'}</p>
            </>
          ) : (
            <>
              <Map size={34} />
              <h1>
                {status === 'Session expired'
                  ? 'Let’s find your seat again.'
                  : 'There’s a seat for you.'}
              </h1>
              <p>{room.error}</p>
            </>
          )}
          <Link className="button primary" href={`/?join=${code}`}>
            {status === 'Connecting' ? 'Back to the tavern' : 'Join this table'}
            <ChevronRight size={17} />
          </Link>
        </div>
      </div>
    );

  return (
    <div className="room-shell">
      <header className="room-nav">
        <div className="room-nav-left">
          <Brand small />
          <span className="nav-divider" />
          <Link href="/" className="tables-link">
            <ArrowLeft size={15} /> Your tables
          </Link>
          <ChevronRight size={14} className="breadcrumb-arrow" />
          <span className="room-name">{snapshot.room.name}</span>
        </div>
        <div className="room-nav-right">
          <span className={`connection ${status !== 'Connected' ? 'connection-offline' : ''}`}>
            <span className="live-dot" />
            <span data-testid="connection-status">{status}</span>
          </span>
          <button className="button invite-button" onClick={copyInvite}>
            <Users size={16} /> Invite friends
          </button>
          <span className="self-avatar" title={snapshot.you.nickname}>
            {snapshot.you.nickname[0].toUpperCase()}
          </span>
        </div>
      </header>
      <div className="room-body">
        <aside
          className={`scene-sidebar ${sidebar ? 'sidebar-open' : ''}`}
          aria-label="Scenes and players"
        >
          <div className="sidebar-heading">
            <span>
              <Layers size={18} /> Your world
            </span>
            <button
              className="icon-button sidebar-close"
              onClick={() => setSidebar(false)}
              aria-label="Close scene sidebar"
            >
              <X size={17} />
            </button>
          </div>
          <div className="scene-list-heading">
            <span>Scenes</span>
            <span>{snapshot.panels.length}</span>
          </div>
          <div className="scene-list">
            {snapshot.panels.map((panel, index) => (
              <button
                key={panel.id}
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
                    {panel.grid.cols} × {panel.grid.rows} tiles
                  </small>
                </span>
                <span className="scene-number">{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
          {isGM && (
            <button className="new-scene" onClick={() => setDialog('new')} disabled={!canEdit}>
              <Plus size={17} /> New scene
            </button>
          )}
          {!isGM && (
            <p className="player-note">
              <Shield size={14} /> Your GM chooses the active scene.
            </p>
          )}
          <div className="party-section">
            <div className="scene-list-heading">
              <span>The party</span>
              <span>{snapshot.members.length} online</span>
            </div>
            <ul className="member-list" data-testid="member-list">
              {snapshot.members.map((member, index) => (
                <li key={member.id}>
                  <span className={`member-avatar avatar-${index % 4}`}>
                    {member.nickname[0].toUpperCase()}
                    <span className="member-online" />
                  </span>
                  <span>
                    <strong>
                      {member.nickname}
                      {member.id === snapshot.you.id && <small> (you)</small>}
                    </strong>
                    <small>{member.role === 'gm' ? 'Game master' : 'Player'}</small>
                  </span>
                  {member.role === 'gm' && <Crown size={15} className="crown" />}
                </li>
              ))}
            </ul>
          </div>
          <div className="sidebar-bottom">
            <div className="table-code">
              <span>Table code</span>
              <button onClick={copyInvite} title="Copy invite link">
                {code}
                <Copy size={13} />
              </button>
            </div>
            <div className="map-file-actions">
              <button onClick={exportMap}>
                <Download size={15} /> Export map
              </button>
              {isGM && (
                <button disabled={!canEdit} onClick={() => importRef.current?.click()}>
                  <Upload size={15} /> Import map
                </button>
              )}
            </div>
            <input
              type="file"
              accept=".json,application/json"
              ref={importRef}
              className="sr-only"
              tabIndex={-1}
              aria-label="Import map file"
              onChange={(event) => void importMap(event.target.files?.[0])}
            />
            <div className="sidebar-brand-note">
              <Leaf size={13} /> A little world, made together.
            </div>
          </div>
        </aside>
        {sidebar && (
          <button
            className="sidebar-backdrop"
            onClick={() => setSidebar(false)}
            aria-label="Close sidebar"
          />
        )}
        <main className="table-main" id="main-content">
          <div className="scene-toolbar">
            <div className="scene-title-group">
              <button
                className="icon-button mobile-scenes"
                aria-label="Open scenes"
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
                  aria-label="Rename current scene"
                  onClick={() => setDialog('rename')}
                  disabled={!canEdit}
                >
                  <Pencil size={13} />
                </button>
              )}
              <span className="live-scene">Live scene</span>
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
                  ? 'Saving…'
                  : status !== 'Connected'
                    ? 'Waiting for connection'
                    : room.error
                      ? 'Check last change'
                      : 'All changes saved'}
              </span>
              <button
                className="icon-button"
                onClick={() => setDialog('help')}
                aria-label="Map help"
              >
                <CircleHelp size={18} />
              </button>
            </div>
          </div>
          {(room.error || localError) && (
            <div role="alert" className="room-error">
              <span>{localError || room.error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
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
                    aria-label="Paint tool"
                    aria-pressed={tool === 'paint'}
                    onClick={() => setTool('paint')}
                    disabled={!canEdit}
                    title="Paint (B)"
                  >
                    <Paintbrush size={17} />
                  </button>
                )}
                <button
                  aria-label="Pan tool"
                  aria-pressed={tool === 'pan' || !isGM}
                  onClick={() => setTool('pan')}
                  title="Pan (H)"
                >
                  <Hand size={17} />
                </button>
                <span />
                <button aria-label="Toggle grid" aria-pressed={grid} onClick={() => setGrid(!grid)}>
                  <Grid2X2 size={17} />
                </button>
              </div>
              {isGM ? (
                <span className="role-tag">
                  <Crown size={13} /> Game master
                </span>
              ) : (
                <span className="role-tag">
                  <Users size={13} /> Player view
                </span>
              )}
            </div>
            <MapCanvas
              key={snapshot.panel.id}
              panel={snapshot.panel}
              terrain={terrain}
              blocked={blocked}
              canEdit={!!canEdit}
              tool={tool}
              gridVisible={grid}
              collisionsVisible={isGM && collisions}
              onPaint={room.paint}
            />
            {isGM && (
              <div className="brush-dock">
                <div className="brush-heading">
                  <span>
                    <Paintbrush size={14} /> Terrain palette
                  </span>
                  <small>Click or drag to paint</small>
                </div>
                <div className="terrain-palette">
                  {terrains.map((next) => (
                    <button
                      key={next}
                      aria-label={terrainInfo[next].label}
                      aria-pressed={terrain === next && tool === 'paint'}
                      disabled={!canEdit}
                      onClick={() => chooseTerrain(next)}
                      title={`${terrainInfo[next].label} (${terrainInfo[next].shortcut})`}
                    >
                      <TerrainSwatch terrain={next} />
                      <span>{terrainInfo[next].label}</span>
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
                    <Shield size={13} /> Block movement
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={collisions}
                      onChange={(event) => setCollisions(event.target.checked)}
                    />
                    Show blocked tiles
                  </label>
                  <span className="brush-current">{terrainInfo[terrain].label}</span>
                </div>
              </div>
            )}
            {!isGM && (
              <div className="player-view-note">
                <Users size={15} /> You’re exploring the world together. Your GM sets the scene.
              </div>
            )}
          </div>
          <footer className="map-status-bar">
            <span>
              <span className="live-dot" />{' '}
              {isGM ? 'Your world, your story.' : 'Adventure is a team sport.'}
            </span>
            <span data-testid="tile-count">{snapshot.panel.tiles.length} tiles</span>
            <span>{isGM ? 'B paint · H pan · 1–7 terrains' : 'Drag to pan · Scroll to zoom'}</span>
          </footer>
        </main>
      </div>
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
              ? 'Set a new scene'
              : dialog === 'rename'
                ? 'Rename your scene'
                : 'Make yourself at home'
          }
          onClose={() => setDialog(null)}
        >
          {dialog === 'help' ? (
            <div className="help-content">
              <p>
                Your table stays in sync with everyone in the party. Changes are saved as you paint.
              </p>
              <dl>
                <div>
                  <dt>Paint</dt>
                  <dd>Click or drag across tiles. Choose a terrain with 1–7.</dd>
                </div>
                <div>
                  <dt>Pan</dt>
                  <dd>
                    Choose the Hand tool (H), hold Alt and drag, or use the middle mouse button.
                  </dd>
                </div>
                <div>
                  <dt>Zoom</dt>
                  <dd>Scroll, use + / −, or fit the whole map with the crosshair.</dd>
                </div>
                <div>
                  <dt>Keyboard</dt>
                  <dd>Focus the map, use arrow keys to select a tile, and Enter to paint.</dd>
                </div>
                <div>
                  <dt>Invite</dt>
                  <dd>
                    Share the invite link or table code. Your private GM credential stays in this
                    browser.
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <form onSubmit={sceneSubmit}>
              <p className="modal-description">
                {dialog === 'new'
                  ? 'A new place for the story to go. Your whole party will follow you into this scene.'
                  : 'Give this chapter a name your party will remember.'}
              </p>
              <label>
                Scene name
                <input
                  name="name"
                  required
                  maxLength={60}
                  autoFocus
                  defaultValue={dialog === 'rename' ? snapshot.panel.name : ''}
                  placeholder="e.g. Mystic woods"
                />
              </label>
              {dialog === 'new' && (
                <>
                  <div className="form-row">
                    <label>
                      Columns
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
                      Rows
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
                    Starting terrain
                    <select name="template" defaultValue="blank">
                      <option value="blank">Blank canvas</option>
                      <option value="woodland">Woodland clearing</option>
                    </select>
                  </label>
                </>
              )}
              {room.error && (
                <p role="alert" className="form-error">
                  {room.error}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setDialog(null)}>
                  Cancel
                </button>
                <button type="submit" className="button primary" disabled={pending > 0 || !canEdit}>
                  {pending > 0 && <LoaderCircle className="spin" size={16} />}
                  {dialog === 'new' ? 'Create scene' : 'Save name'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
