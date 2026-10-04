import english from '../../messages/en.json';

const errorKeys = new Map(Object.entries(english.errors).map(([key, value]) => [value, key]));

// API and validation contracts stay locale-independent; translate at their UI boundary.
export function localizeError(message: string, translate: (key: string) => string): string {
  if (!message) return '';
  const key = errorKeys.get(message);
  if (key) return translate(key);
  if (/^(Invalid |Too (?:big|small):|Unrecognized keys?:)/.test(message))
    return translate('validation');
  return message;
}
