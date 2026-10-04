import type { Metadata } from 'next';
import localFont from 'next/font/local';
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

export const metadata: Metadata = {
  title: 'Tavern — A place for your next adventure',
  description:
    'A free, open-source virtual tabletop. Build little worlds, gather your friends, and tell a great story.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${pixelifySans.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
