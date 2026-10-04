import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { localeCookie, resolveLocale } from './locale';

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(localeCookie)?.value,
    headerStore.get('accept-language') ?? '',
  );
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'UTC',
  };
});
