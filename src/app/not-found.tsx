import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Brand } from '../components/ui/brand';
export default function NotFound() {
  const t = useTranslations();
  return (
    <main className="error-page">
      <Brand />
      <h1>{t('errors.notFoundTitle')}</h1>
      <p>{t('errors.notFoundDescription')}</p>
      <Link className="button primary" href="/">
        {t('common.backToTavern')}
      </Link>
    </main>
  );
}
