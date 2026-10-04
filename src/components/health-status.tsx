import { useTranslations } from 'next-intl';
import { Heart, Skull } from 'lucide-react';
import type { CharacterHealth } from '../types/game';

export function HealthStatus({ health, nickname }: { health: CharacterHealth; nickname: string }) {
  const t = useTranslations();
  const ratio = health.current / health.max;
  const state =
    health.current === 0
      ? 'unconscious'
      : ratio < 0.25
        ? 'danger'
        : ratio <= 0.5
          ? 'warning'
          : 'healthy';
  return (
    <span className="health-status" data-health-state={state}>
      <span className="health-count">
        {health.current === 0 ? (
          <Skull size={14} aria-hidden="true" />
        ) : (
          <Heart size={14} aria-hidden="true" />
        )}
        {health.current}/{health.max} {t('common.hp')}
      </span>
      <span
        className="health-track"
        role="meter"
        aria-label={t('health.meterLabel', { nickname })}
        aria-valuemin={0}
        aria-valuemax={health.max}
        aria-valuenow={health.current}
        aria-valuetext={t('health.meterValue', {
          current: health.current,
          max: health.max,
          hp: t('common.hp'),
          state: health.current === 0 ? t('health.unconsciousSuffix') : '',
        })}
      >
        <span className="health-fill" style={{ transform: `scaleX(${ratio})` }} />
      </span>
      {health.current === 0 && <span className="health-ko">{t('health.unconscious')}</span>}
    </span>
  );
}
