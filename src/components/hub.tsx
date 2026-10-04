'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Compass,
  Crown,
  Leaf,
  LoaderCircle,
  Map,
  Plus,
  ShieldCheck,
  Users,
  WandSparkles,
} from 'lucide-react';
import { FormSelect } from './ui/select';
import { ClassManager } from './class-manager';
import { ClassSummary } from './class-summary';
import { defaultClasses } from '../lib/classes';
import { Brand } from './ui/brand';
import { MapPreview } from './canvas/map-preview';
import { rememberTable, savedTables, sessionFor, type SavedTable } from '../lib/sessions';
import type { Credential, Reply } from '../types/game';

export function Hub() {
  const router = useRouter();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<SavedTable[]>([]);
  const [code, setCode] = useState('');
  const [classes, setClasses] = useState(() => structuredClone(defaultClasses));
  const [classManagerOpen, setClassManagerOpen] = useState(false);
  const [previewClassId, setPreviewClassId] = useState(defaultClasses[0].id);
  const previewClass = classes.find((item) => item.id === previewClassId) ?? classes[0];
  useEffect(() => {
    Promise.resolve().then(() => {
      setRecent(savedTables());
      const invite = new URLSearchParams(window.location.search).get('join');
      if (invite) {
        setMode('join');
        setCode(invite.toUpperCase());
      }
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || 'An adventure');
    try {
      const response = await fetch(mode === 'create' ? '/api/rooms' : '/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          nickname: form.get('nickname'),
          code: form.get('code'),
          template: form.get('template'),
          classes: mode === 'create' ? classes : undefined,
          session: mode === 'join' ? sessionFor(String(form.get('code') || '').trim()) : undefined,
        }),
      });
      const reply: Reply<Credential> = await response.json();
      if (!reply.ok) throw new Error(reply.error);
      rememberTable(reply.data, mode === 'create' ? name : 'Your adventure');
      router.push(`/room/${reply.data.roomCode}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not reach the tavern. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hub">
      <header className="hub-nav">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#your-tables">Your tables</a>
          <span className="free-badge">
            <Leaf size={14} /> Free & open source
          </span>
        </nav>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-star">✦</span> There’s a seat for everyone
            </span>
            <h1>
              A little world.
              <br />A great adventure.
            </h1>
            <p>
              Gather your friends, draw a map, and see where the story takes you. Your next tabletop
              adventure starts here.
            </p>
            <div className="hero-tags">
              <span>
                <Users size={16} /> Made for friends
              </span>
              <span>
                <ShieldCheck size={16} /> No accounts needed
              </span>
            </div>
          </div>
          <div className="hero-map">
            <div className="preview-window">
              <div className="preview-heading">
                <span>
                  <span className="live-dot" /> A world waiting to happen
                </span>
                <span className="preview-mini-label">The woodland clearing</span>
              </div>
              <MapPreview />
              <div className="preview-caption">
                <span className="preview-compass">
                  <Compass size={19} />
                </span>
                <div>
                  <strong>Small maps. Endless possibilities.</strong>
                  <span>Every great story starts somewhere.</span>
                </div>
                <span className="preview-grid-label">26 × 18</span>
              </div>
            </div>
            <div className="map-note">
              <WandSparkles size={15} /> Make it yours, one tile at a time
            </div>
          </div>
        </section>

        <section className="start-section" aria-labelledby="start-title">
          <div className="start-intro">
            <span className="section-kicker">The adventure is yours</span>
            <h2 id="start-title">Pull up a chair.</h2>
            <p>
              A table for your party. A canvas for your imagination. Just bring a nickname and a
              good story.
            </p>
            <div className="steps" id="how-it-works">
              <div>
                <span className="step-icon">
                  <Plus size={19} />
                </span>
                <div>
                  <strong>Make a little space</strong>
                  <p>Create a table and become its game master.</p>
                </div>
              </div>
              <div>
                <span className="step-icon">
                  <Map size={19} />
                </span>
                <div>
                  <strong>Set the scene</strong>
                  <p>Paint forests, rivers, and paths for your party.</p>
                </div>
              </div>
              <div>
                <span className="step-icon">
                  <Users size={19} />
                </span>
                <div>
                  <strong>Let the story unfold</strong>
                  <p>Share your table code. Everyone sees the same world.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="start-card">
            <div className="form-tabs" role="tablist" aria-label="Start an adventure">
              <button
                role="tab"
                id="create-tab"
                aria-controls="table-form"
                aria-selected={mode === 'create'}
                onClick={() => {
                  setMode('create');
                  setError('');
                }}
              >
                <Plus size={17} /> Create a table
              </button>
              <button
                role="tab"
                id="join-tab"
                aria-controls="table-form"
                aria-selected={mode === 'join'}
                onClick={() => {
                  setMode('join');
                  setError('');
                }}
              >
                <Users size={17} /> Join a table
              </button>
            </div>
            <form id="table-form" role="tabpanel" aria-labelledby={`${mode}-tab`} onSubmit={submit}>
              <div className="form-intro">
                <h3>{mode === 'create' ? 'A new story awaits.' : 'Your party is waiting.'}</h3>
                <p>
                  {mode === 'create'
                    ? 'You’ll be the game master of this table.'
                    : 'Grab the code from your game master.'}
                </p>
              </div>
              <label>
                Your nickname
                <input
                  name="nickname"
                  placeholder="What should your party call you?"
                  required
                  maxLength={24}
                  autoComplete="nickname"
                />
              </label>
              {mode === 'create' ? (
                <>
                  <label>
                    Table name
                    <input
                      name="name"
                      placeholder="e.g. The road to Guardia"
                      required
                      maxLength={60}
                    />
                  </label>
                  <label>
                    Starting map
                    <FormSelect
                      label="Starting map"
                      name="template"
                      defaultValue="woodland"
                      options={[
                        { value: 'woodland', label: 'Woodland clearing · ready to explore' },
                        { value: 'blank', label: 'Blank canvas · build from scratch' },
                      ]}
                    />
                  </label>
                  <section className="starting-classes" aria-label="Starting classes">
                    <div className="starting-classes-heading">
                      <strong>Starting classes</strong>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => setClassManagerOpen(true)}
                      >
                        Configure classes
                      </button>
                    </div>
                    <p className="subtle">
                      {classes.length
                        ? classes.map((item) => item.name).join(' · ')
                        : 'No classes configured.'}
                    </p>
                    {previewClass && (
                      <details>
                        <summary>Preview attributes and traits</summary>
                        <FormSelect
                          label="Preview class"
                          value={previewClass.id}
                          disabled={busy}
                          onValueChange={setPreviewClassId}
                          options={classes.map((item) => ({ value: item.id, label: item.name }))}
                        />
                        <ClassSummary characterClass={previewClass} />
                      </details>
                    )}
                  </section>
                </>
              ) : (
                <label>
                  Table code
                  <input
                    name="code"
                    placeholder="TVRN-ABC234"
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    maxLength={11}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button className="button primary wide" disabled={busy} type="submit">
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : mode === 'create' ? (
                  <Plus size={18} />
                ) : (
                  <ArrowRight size={18} />
                )}
                {busy
                  ? 'Opening your table…'
                  : mode === 'create'
                    ? 'Create a table'
                    : 'Join adventure'}
                {!busy && <ArrowRight size={17} className="button-end" />}
              </button>
              <p className="form-footnote">
                <ShieldCheck size={14} />
                {mode === 'create'
                  ? 'No signup. No rulebooks. Just your imagination.'
                  : 'Joined before? We’ll restore your saved seat and nickname.'}
              </p>
            </form>
          </div>
        </section>

        <section id="your-tables" className="recent-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Pick up where you left off</span>
              <h2>Your tables</h2>
            </div>
            <span className="subtle">Saved in this browser</span>
          </div>
          {recent.length ? (
            <div className="recent-grid">
              {recent.map((table) => (
                <Link
                  key={table.roomCode}
                  className="recent-table"
                  href={`/room/${table.roomCode}`}
                >
                  <div className="table-art">
                    <Map size={26} />
                  </div>
                  <div>
                    <h3>{table.name}</h3>
                    <p>
                      <span>
                        {table.role === 'gm' ? <Crown size={13} /> : <Users size={13} />}
                        {table.role === 'gm' ? 'Game master' : 'Player'}
                      </span>
                      <span>{table.roomCode}</span>
                    </p>
                  </div>
                  <ChevronRight size={19} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-tables">
              <BookOpen size={26} />
              <div>
                <strong>The first chapter is still unwritten.</strong>
                <p>Create or join a table and it will appear here.</p>
              </div>
              <span className="tiny-star">✦</span>
            </div>
          )}
        </section>
      </main>
      <footer className="hub-footer">
        <Brand small />
        <p>For the stories you’ll tell together.</p>
        <span>Built for play. Open to everyone.</span>
      </footer>
      {classManagerOpen && (
        <ClassManager
          classes={classes}
          busy={busy}
          onClose={() => setClassManagerOpen(false)}
          onSave={async (value) => {
            setClasses(value);
            return true;
          }}
        />
      )}
    </div>
  );
}
