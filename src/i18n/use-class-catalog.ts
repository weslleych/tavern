'use client';

import { useTranslations } from 'next-intl';
import { localizeClasses } from '../lib/classes';
import type { CharacterClass } from '../types/game';

export function useClassCatalog(classes: CharacterClass[]) {
  const t = useTranslations('classes.presets');
  return localizeClasses(classes, t);
}
