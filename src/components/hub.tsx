'use client';

import { useTranslations } from 'next-intl';
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
import { LanguageSwitcher } from './ui/language-switcher';
import { useClassCatalog } from '../i18n/use-class-catalog';
import { useErrorMessage } from '../i18n/use-error-message';
import { ClassManager } from './class-manager';
import { ClassSummary } from './class-summary';
import { defaultClasses } from '../lib/classes';
import { Brand } from './ui/brand';
import { MapPreview } from './canvas/map-preview';
import { rememberTable, savedTables, sessionFor, type SavedTable } from '../lib/sessions';
import type { Credential, Reply } from '../types/game';

export function Hub() {
  const t = useTranslations();
  const formatError = useErrorMessage();
  const router = useRouter();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<SavedTable[]>([]);
  const [code, setCode] = useState('');
  const [classes, setClasses] = useState(() => structuredClone(defaultClasses));
  const [classManagerOpen, setClassManagerOpen] = useState(false);
  const displayClasses = useClassCatalog(classes);
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
    const name = String(form.get('name') || t('hub.defaultAdventure'));
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
      rememberTable(reply.data, mode === 'create' ? name : t('hub.yourAdventure'));
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
        <nav aria-label={t('nav.mainNavigation')}>
          <LanguageSwitcher />
          <a href="#how-it-works">{t('nav.howItWorks')}</a>
          <a href="#your-tables">{t('common.yourTables')}</a>
          <span className="free-badge">
            <Leaf size={14} /> {t('nav.openSource')}
          </span>
        </nav>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-star">✦</span> {t('hub.seatForEveryone')}
            </span>
            <h1>
              {t('hub.littleWorld')} <br />
              {t('hub.greatAdventure')}
            </h1>
            <p>{t('hub.heroDescription')}</p>
            <div className="hero-tags">
              <span>
                <Users size={16} /> {t('hub.madeForFriends')}
              </span>
              <span>
                <ShieldCheck size={16} /> {t('hub.noAccounts')}
              </span>
            </div>
          </div>
          <div className="hero-map">
            <div className="preview-window">
              <div className="preview-heading">
                <span>
                  <span className="live-dot" /> {t('hub.worldWaiting')}
                </span>
                <span className="preview-mini-label">{t('hub.woodlandPreview')}</span>
              </div>
              <MapPreview />
              <div className="preview-caption">
                <span className="preview-compass">
                  <Compass size={19} />
                </span>
                <div>
                  <strong>{t('hub.smallMaps')}</strong>
                  <span>{t('hub.storyStarts')}</span>
                </div>
                <span className="preview-grid-label">26 × 18</span>
              </div>
            </div>
            <div className="map-note">
              <WandSparkles size={15} /> {t('hub.makeItYours')}
            </div>
          </div>
        </section>

        <section className="start-section" aria-labelledby="start-title">
          <div className="start-intro">
            <span className="section-kicker">{t('hub.adventureIsYours')}</span>
            <h2 id="start-title">{t('hub.pullUpChair')}</h2>
            <p>{t('hub.startDescription')}</p>
            <div className="steps" id="how-it-works">
              <div>
                <span className="step-icon">
                  <Plus size={19} />
                </span>
                <div>
                  <strong>{t('hub.makeSpace')}</strong>
                  <p>{t('hub.createStep')}</p>
                </div>
              </div>
              <div>
                <span className="step-icon">
                  <Map size={19} />
                </span>
                <div>
                  <strong>{t('hub.setScene')}</strong>
                  <p>{t('hub.paintStep')}</p>
                </div>
              </div>
              <div>
                <span className="step-icon">
                  <Users size={19} />
                </span>
                <div>
                  <strong>{t('hub.storyUnfold')}</strong>
                  <p>{t('hub.shareStep')}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="start-card">
            <div className="form-tabs" role="tablist" aria-label={t('hub.startAdventure')}>
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
                <Plus size={17} /> {t('hub.createTable')}
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
                <Users size={17} /> {t('hub.joinTable')}
              </button>
            </div>
            <form id="table-form" role="tabpanel" aria-labelledby={`${mode}-tab`} onSubmit={submit}>
              <div className="form-intro">
                <h3>{mode === 'create' ? t('hub.newStory') : t('hub.partyWaiting')}</h3>
                <p>{mode === 'create' ? t('hub.gmDescription') : t('hub.joinDescription')}</p>
              </div>
              <label>
                {t('hub.nickname')}{' '}
                <input
                  name="nickname"
                  placeholder={t('hub.nicknamePlaceholder')}
                  required
                  maxLength={24}
                  autoComplete="nickname"
                />
              </label>
              {mode === 'create' ? (
                <>
                  <label>
                    {t('hub.tableName')}{' '}
                    <input
                      name="name"
                      placeholder={t('hub.tablePlaceholder')}
                      required
                      maxLength={60}
                    />
                  </label>
                  <label>
                    {t('hub.startingMap')}{' '}
                    <FormSelect
                      label={t('hub.startingMap')}
                      name="template"
                      defaultValue="woodland"
                      options={[
                        { value: 'woodland', label: t('hub.woodlandOption') },
                        { value: 'blank', label: t('hub.blankOption') },
                      ]}
                    />
                  </label>
                  <section className="starting-classes" aria-label={t('hub.startingClasses')}>
                    <div className="starting-classes-heading">
                      <strong>{t('hub.startingClasses')}</strong>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={() => setClassManagerOpen(true)}
                      >
                        {t('hub.configureClasses')}
                      </button>
                    </div>
                    <p className="subtle">
                      {classes.length
                        ? displayClasses.map((item) => item.name).join(' · ')
                        : t('hub.noClasses')}
                    </p>
                    {previewClass && (
                      <details>
                        <summary>{t('hub.previewAttributes')}</summary>
                        <FormSelect
                          label={t('hub.previewClass')}
                          value={previewClass.id}
                          disabled={busy}
                          onValueChange={setPreviewClassId}
                          options={displayClasses.map((item) => ({
                            value: item.id,
                            label: item.name,
                          }))}
                        />
                        <ClassSummary characterClass={previewClass} />
                      </details>
                    )}
                  </section>
                </>
              ) : (
                <label>
                  {t('hub.tableCode')}{' '}
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
                  {formatError(error)}
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
                  ? t('hub.openingTable')
                  : mode === 'create'
                    ? t('hub.createTable')
                    : t('hub.joinAdventure')}
                {!busy && <ArrowRight size={17} className="button-end" />}
              </button>
              <p className="form-footnote">
                <ShieldCheck size={14} />
                {mode === 'create' ? t('hub.createFootnote') : t('hub.joinFootnote')}
              </p>
            </form>
          </div>
        </section>

        <section id="your-tables" className="recent-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">{t('hub.pickUpStory')}</span>
              <h2>{t('common.yourTables')}</h2>
            </div>
            <span className="subtle">{t('hub.savedBrowser')}</span>
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
                        {table.role === 'gm' ? t('common.gameMaster') : t('common.player')}
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
                <strong>{t('hub.unwrittenChapter')}</strong>
                <p>{t('hub.recentDescription')}</p>
              </div>
              <span className="tiny-star">✦</span>
            </div>
          )}
        </section>
      </main>
      <footer className="hub-footer">
        <Brand small />
        <p>{t('hub.footerStories')}</p>
        <span>{t('hub.footerPlay')}</span>
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
