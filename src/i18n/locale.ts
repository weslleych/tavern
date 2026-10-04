export const locales = ['en', 'es', 'pt-BR'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const localeCookie = 'NEXT_LOCALE';
export const localeStorageKey = 'tavern:locale:v1';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.includes(value as Locale);
}

export function resolveLocale(cookie?: string, acceptLanguage = ''): Locale {
  if (isLocale(cookie)) return cookie;
  const preferences = acceptLanguage
    .split(',')
    .map((entry) => {
      const [language, ...parameters] = entry.trim().toLowerCase().split(';');
      const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const weight = quality ? Number(quality.trim().slice(2)) : 1;
      return { language, weight };
    })
    .filter(({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight);
  for (const { language } of preferences) {
    const base = language.split('-')[0];
    if (base === 'pt') return 'pt-BR';
    if (base === 'es') return 'es';
    if (base === 'en') return 'en';
  }
  return defaultLocale;
}
