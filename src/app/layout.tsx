import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import './globals.css';

const dmSans = localFont({
  src: './fonts/dm-sans-latin.woff2',
  variable: '--font-dm-sans',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  fallback: ['Segoe UI', 'Arial', 'sans-serif'],
});

const pixelifySans = localFont({
  src: './fonts/pixelify-sans-latin.woff2',
  variable: '--font-pixelify-sans',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  fallback: ['Trebuchet MS', 'sans-serif'],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('metadataTitle'), description: t('metadataDescription') };
}
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, t] = await Promise.all([
    getLocale(),
    getMessages(),
    getTranslations('nav'),
  ]);
  return (
    <html
      lang={locale}
      className={`${dmSans.variable} ${pixelifySans.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a className="skip-link" href="#main-content">
            {t('skipLink')}
          </a>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
