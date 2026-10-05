'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Upload } from 'lucide-react';
import type {
  MonsterDefinition,
  PublicMonster,
  HpVisibility,
  MonsterHealthRequest,
  MonsterVisibilityRequest,
  MonsterReference,
  MonsterMoveRequest,
} from '../types/game';
import { monsterSprites } from '../lib/monster-sprites';
import { calculateAttributes, attributeDefinitions } from '../lib/classes';
import { monsterDefinitionSchema, monsterSpriteSchema, readableError } from '../lib/validation';
import { drawMonsterSprite } from './canvas/monster-render';
import { Modal } from './ui/modal';
import { FormSelect } from './ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { useErrorMessage } from '../i18n/use-error-message';

export function MonsterPortrait({ sprite, size = 48 }: { sprite: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const draw = (image?: HTMLImageElement) => {
      ctx.clearRect(0, 0, size, size);
      drawMonsterSprite(ctx, sprite, 0, 0, size, image);
    };
    if (sprite.startsWith('data:')) {
      const image = new Image();
      image.onload = () => draw(image);
      image.src = sprite;
      return () => {
        image.onload = null;
      };
    }
    draw();
  }, [sprite, size]);
  return (
    <canvas className="monster-portrait" ref={ref} width={size} height={size} aria-hidden="true" />
  );
}
export function useMonsterName() {
  const t = useTranslations();
  return (monster: { name: string; definitionId?: string; id: string }) => {
    const preset = monsterSprites.find((p) => p.id === (monster.definitionId ?? monster.id));
    return preset && preset.name === monster.name ? t(`monsters.${preset.id}`) : monster.name;
  };
}
export function MonsterHealth({ monster }: { monster: PublicMonster }) {
  const t = useTranslations(),
    name = useMonsterName(),
    ratio = monster.healthRatio;
  return (
    <span className="monster-health">
      {ratio !== undefined && (
        <span
          className="monster-meter"
          role="progressbar"
          aria-label={t('monsters.health', { name: name(monster) })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
        >
          <span
            style={{
              transform: `scaleX(${ratio})`,
              background: ratio > 0.5 ? '#22c55e' : ratio >= 0.25 ? '#f59e0b' : '#ef4444',
            }}
          />
        </span>
      )}
      {monster.currentHp !== undefined && (
        <span>
          {monster.currentHp}/{monster.maxHp} HP
        </span>
      )}
      {monster.defeated && <span>{t('monsters.defeated')}</span>}
    </span>
  );
}
export function HpVisibilityPicker({
  value,
  disabled,
  onChange,
}: {
  value: HpVisibility;
  disabled: boolean;
  onChange: (value: HpVisibility) => void | Promise<boolean>;
}) {
  const t = useTranslations();
  const [selected, setSelected] = useState(value);
  return (
    <fieldset className="visibility-picker" disabled={disabled}>
      <legend>{t('monsters.visibility')}</legend>
      {(['gm_only', 'bar_only', 'public'] as const).map((option) => (
        <label key={option}>
          <input
            type="radio"
            name="hpVisibility"
            checked={selected === option}
            onChange={() => {
              setSelected(option);
              const result = onChange(option);
              if (result)
                void result.then((ok) => {
                  if (!ok) setSelected(value);
                });
            }}
          />
          {t(`monsters.${option}`)}
        </label>
      ))}
    </fieldset>
  );
}
export function MonsterFormModal({
  initial,
  busy,
  error,
  onSave,
  onClose,
}: {
  initial?: MonsterDefinition;
  busy: boolean;
  error: string;
  onSave: (definition: MonsterDefinition) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations(),
    formatError = useErrorMessage();
  const [draft, setDraft] = useState<MonsterDefinition>(() =>
    initial
      ? structuredClone(initial)
      : {
          id: crypto.randomUUID(),
          name: '',
          sprite: 'goblin',
          attributes: calculateAttributes(),
          defaultMaxHp: 20,
          attackNotation: '1d12',
          hpVisibility: 'bar_only',
          isCustom: true,
        },
  );
  const [localError, setLocalError] = useState('');
  const [uploading, setUploading] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
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
        const sprite = monsterSpriteSchema.parse(canvas.toDataURL('image/png'));
        setDraft((previous) => ({ ...previous, sprite }));
        setLocalError('');
      } finally {
        image.close();
      }
    } catch (error) {
      setLocalError(readableError(error));
    } finally {
      setUploading(false);
    }
  }
  return (
    <Modal title={t(initial ? 'monsters.edit' : 'monsters.create')} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const parsed = monsterDefinitionSchema.safeParse(draft);
          if (!parsed.success) {
            setLocalError(readableError(parsed.error));
            return;
          }
          if (await onSave(parsed.data)) onClose();
        }}
      >
        <fieldset disabled={busy || uploading} className="monster-form">
          <div className="monster-form-preview">
            <MonsterPortrait sprite={draft.sprite} size={64} />
          </div>
          <label>
            {t('monsters.name')}
            <input
              autoFocus
              required
              maxLength={60}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <div className="form-row">
            <label>
              {t('monsters.hp')}
              <input
                type="number"
                required
                min={1}
                max={9999}
                value={draft.defaultMaxHp}
                onChange={(e) => setDraft({ ...draft, defaultMaxHp: e.target.valueAsNumber })}
              />
            </label>
            <label>
              {t('monsters.attack')}
              <input
                required
                maxLength={30}
                value={draft.attackNotation}
                onChange={(e) => setDraft({ ...draft, attackNotation: e.target.value })}
              />
            </label>
          </div>
          <label>
            {t('monsters.sprite')}
            <FormSelect
              label={t('monsters.sprite')}
              value={draft.sprite.startsWith('data:') ? '__custom' : draft.sprite}
              onValueChange={(sprite) => {
                if (monsterSprites.some((p) => p.id === sprite))
                  setDraft((previous) => ({ ...previous, sprite }));
              }}
              options={[
                ...monsterSprites.map((p) => ({ value: p.id, label: t(`monsters.${p.id}`) })),
                ...(draft.sprite.startsWith('data:')
                  ? [{ value: '__custom', label: t('monsters.custom') }]
                  : []),
              ]}
            />
          </label>
          <label className="sprite-upload">
            <Upload size={16} aria-hidden="true" />
            {t('monsters.upload')}
            <input
              type="file"
              accept="image/png,.png"
              aria-label={t('monsters.upload')}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
          <div className="attribute-editor">
            {attributeDefinitions.map(({ id }) => (
              <label key={id}>
                {t(`classes.attributes.${id}.name`)}
                <input
                  type="number"
                  required
                  min={-100}
                  max={100}
                  value={draft.attributes[id]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      attributes: { ...draft.attributes, [id]: e.target.valueAsNumber },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <HpVisibilityPicker
            key={draft.hpVisibility}
            value={draft.hpVisibility}
            disabled={busy}
            onChange={(hpVisibility) => setDraft({ ...draft, hpVisibility })}
          />
        </fieldset>
        {(localError || error) && (
          <p className="form-error" role="alert">
            {formatError(localError || error)}
          </p>
        )}
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="button primary" disabled={busy || uploading}>
            {t('monsters.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function BestiaryDrawer({
  definitions,
  busy,
  error,
  onSave,
  onDelete,
  onSummon,
  onClose,
}: {
  definitions: MonsterDefinition[];
  busy: boolean;
  error: string;
  onSave: (definition: MonsterDefinition) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onSummon: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations(),
    name = useMonsterName(),
    formatError = useErrorMessage(),
    [editing, setEditing] = useState<MonsterDefinition | null | undefined>();
  return (
    <>
      <Modal title={t('monsters.bestiary')} className="bestiary-drawer" onClose={onClose}>
        <p className="modal-description">{t('monsters.bestiaryHint')}</p>
        <Tabs defaultValue="presets" className="bestiary-content">
          <TabsList aria-label={t('monsters.bestiary')}>
            <TabsTrigger value="presets">{t('monsters.presets')}</TabsTrigger>
            <TabsTrigger value="custom">{t('monsters.custom')}</TabsTrigger>
          </TabsList>
          {['presets', 'custom'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {tab === 'custom' && !definitions.some((d) => d.isCustom) && (
                <p className="bestiary-empty" role="status">
                  {t('monsters.emptyCustom')}
                </p>
              )}
              <div className="bestiary-grid">
                {definitions
                  .filter((d) => (tab === 'custom' ? d.isCustom : !d.isCustom))
                  .map((definition) => (
                    <article className="bestiary-card" key={definition.id}>
                      <MonsterPortrait sprite={definition.sprite} />
                      <h3>{name(definition)}</h3>
                      <p>
                        {definition.defaultMaxHp} HP · {definition.attackNotation}
                      </p>
                      <div className="monster-stat-line">
                        {attributeDefinitions.map((a) => (
                          <span key={a.id} title={t(`classes.attributes.${a.id}.name`)}>
                            {t(`classes.attributes.${a.id}.abbreviation`)}{' '}
                            {definition.attributes[a.id] >= 0 ? '+' : ''}
                            {definition.attributes[a.id]}
                          </span>
                        ))}
                      </div>
                      <button
                        className="button primary"
                        disabled={busy}
                        aria-label={t('monsters.summon', { name: name(definition) })}
                        onClick={() => {
                          onSummon(definition.id);
                          onClose();
                        }}
                      >
                        {t('monsters.summon', { name: name(definition) })}
                      </button>
                      <div className="bestiary-card-actions">
                        <button
                          className="icon-button"
                          disabled={busy}
                          aria-label={`${t('monsters.edit')}: ${name(definition)}`}
                          onClick={() => setEditing(definition)}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        {definition.isCustom && (
                          <button
                            className="icon-button"
                            disabled={busy}
                            aria-label={`${t('monsters.remove')}: ${name(definition)}`}
                            onClick={() => void onDelete(definition.id)}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <div className="bestiary-footer">
          {error && (
            <p className="form-error" role="alert">
              {formatError(error)}
            </p>
          )}
          <button className="button secondary" disabled={busy} onClick={() => setEditing(null)}>
            <Plus size={16} aria-hidden="true" />
            {t('monsters.create')}
          </button>
        </div>
      </Modal>
      {editing !== undefined && (
        <MonsterFormModal
          initial={editing ?? undefined}
          busy={busy}
          error={error}
          onSave={onSave}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
export function MonsterInspector({
  monster,
  panelId,
  busy,
  error,
  onAdjust,
  onVisibility,
  onRemove,
  onMove,
  onCombat,
  onClose,
}: {
  monster: PublicMonster;
  panelId: string;
  busy: boolean;
  error: string;
  onAdjust: (r: MonsterHealthRequest) => Promise<boolean>;
  onVisibility: (r: MonsterVisibilityRequest) => Promise<boolean>;
  onRemove: (r: MonsterReference) => Promise<boolean>;
  onMove: (r: MonsterMoveRequest) => Promise<boolean>;
  onCombat: (r: MonsterReference) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations(),
    formatError = useErrorMessage(),
    name = useMonsterName();
  const reference = { panelId, monsterId: monster.id };
  return (
    <Modal title={name(monster)} onClose={onClose}>
      <div className="monster-inspection">
        <MonsterPortrait sprite={monster.sprite} size={64} />
        <MonsterHealth monster={monster} />
      </div>
      <div className="health-steps">
        {[-5, -1, 1, 5].map((delta) => (
          <button
            className="button secondary"
            key={delta}
            disabled={busy}
            aria-label={`${delta > 0 ? '+' : ''}${delta} HP`}
            onClick={() => void onAdjust({ ...reference, delta })}
          >
            {delta > 0 ? '+' : ''}
            {delta} HP
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void onAdjust({
            ...reference,
            current: Number(data.get('current')),
            gmBonusHp: Number(data.get('bonus')),
          });
        }}
      >
        <div className="form-row">
          <label>
            {t('monsters.currentHp')}
            <input
              key={monster.currentHp}
              type="number"
              name="current"
              required
              min={0}
              max={9999}
              defaultValue={monster.currentHp}
            />
          </label>
          <label>
            {t('monsters.bonus')}
            <input
              type="number"
              name="bonus"
              required
              min={-9998}
              max={9998}
              defaultValue={monster.gmBonusHp ?? 0}
            />
          </label>
        </div>
        <button className="button secondary" disabled={busy}>
          {t('monsters.setHp')}
        </button>
      </form>
      <HpVisibilityPicker
        key={monster.hpVisibility}
        value={monster.hpVisibility}
        disabled={busy}
        onChange={(hpVisibility) => onVisibility({ ...reference, hpVisibility })}
      />
      <form
        key={`${monster.x},${monster.y}`}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void onMove({ ...reference, x: Number(data.get('x')) - 1, y: Number(data.get('y')) - 1 });
        }}
      >
        <div className="form-row">
          <label>
            {t('monsters.x')}
            <input name="x" type="number" min={1} max={64} required defaultValue={monster.x + 1} />
          </label>
          <label>
            {t('monsters.y')}
            <input name="y" type="number" min={1} max={64} required defaultValue={monster.y + 1} />
          </label>
        </div>
        <button className="button secondary" disabled={busy}>
          {t('monsters.move')}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {formatError(error)}
        </p>
      )}
      <div className="modal-actions">
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            if (await onRemove(reference)) onClose();
          }}
        >
          {t('monsters.remove')}
        </button>
        <button
          className="button primary"
          disabled={busy || monster.defeated}
          onClick={async () => {
            if (await onCombat(reference)) onClose();
          }}
        >
          {t('monsters.enterCombat')}
        </button>
      </div>
    </Modal>
  );
}
