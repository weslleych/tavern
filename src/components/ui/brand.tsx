import Link from 'next/link';
import { Castle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function Brand({ small = false }: { small?: boolean }) {
  const t = useTranslations('nav');
  return (
    <Link className={`brand ${small ? 'brand-small' : ''}`} href="/" aria-label={t('home')}>
      <span className="brand-mark">
        <Castle size={small ? 19 : 23} strokeWidth={1.8} />
      </span>
      <span>
        Tavern<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
