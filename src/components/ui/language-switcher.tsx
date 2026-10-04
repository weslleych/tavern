'use client';

import { useEffect, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { isLocale, localeCookie, localeStorageKey } from '../../i18n/locale';
import { FormSelect } from './select';

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('nav');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // The cookie is authoritative. Recover a preference only when it is missing.
    try {
      const hasCookie = document.cookie
        .split(';')
        .some((item) => item.trim().startsWith(`${localeCookie}=`));
      const saved = localStorage.getItem(localeStorageKey);
      if (!hasCookie && isLocale(saved) && saved !== locale) {
        document.cookie = `${localeCookie}=${saved}; path=/; max-age=31536000; SameSite=Lax`;
        startTransition(() => router.refresh());
      } else {
        localStorage.setItem(localeStorageKey, locale);
      }
    } catch {
      // Cookie-based preferences work when browser storage is unavailable.
    }
  }, [locale, router]);

  return (
    <div className="language-switcher" aria-busy={pending}>
      <Languages size={16} aria-hidden="true" />
      <FormSelect
        label={t('language')}
        value={locale}
        disabled={pending}
        onValueChange={(value) => {
          if (!isLocale(value) || value === locale) return;
          document.cookie = `${localeCookie}=${value}; path=/; max-age=31536000; SameSite=Lax`;
          try {
            localStorage.setItem(localeStorageKey, value);
          } catch {
            /* Cookie remains usable. */
          }
          startTransition(() => router.refresh());
        }}
        options={[
          { value: 'en', label: 'English', lang: 'en' },
          { value: 'es', label: 'Español', lang: 'es' },
          { value: 'pt-BR', label: 'Português', lang: 'pt-BR' },
        ]}
      />
    </div>
  );
}
