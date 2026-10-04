'use client';

import { useTranslations } from 'next-intl';
import { localizeError } from './errors';

export function useErrorMessage() {
  const t = useTranslations('errors');
  return (message: string) => localizeError(message, t);
}
