import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppShell from '@/components/shell/AppShell';
import Providers from '@/components/shared/Providers';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Contentine Create — AI Video Platform',
  description: 'Create unlimited AI-powered videos, repurpose content, and publish everywhere. Browser-first, no credits.',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

/** Inline script that runs before paint to set dark class based on stored preference. */
const themeScript = `
(function(){
  try {
    var s = localStorage.getItem('contentine_theme');
    var d = (!s && window.matchMedia('(prefers-color-scheme: dark)').matches) || s === 'dark';
    if (d) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch(e){}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-white dark:bg-dark env-safe">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
