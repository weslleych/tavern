'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations();
  return (
    <main className="error-page">
      <h1>{t('errors.errorTitle')}</h1>
      <p>{t('errors.errorDescription')}</p>
      <button className="button primary" onClick={reset}>
        {t('common.tryAgain')}
      </button>
      <Link href="/">{t('common.backToTavern')}</Link>
    </main>
  );
}
