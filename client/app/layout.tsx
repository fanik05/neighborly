import type { Metadata } from 'next';
import { Archivo, Public_Sans, DM_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ConversationsProvider } from '@/lib/useConversations';
import { LoansProvider } from '@/lib/useLoans';
import Navbar from '@/components/Navbar';

// "The Lending Desk" type system:
// — Archivo (heavy + wide tracking): official catalog-header display
// — Public Sans: civic, readable body
// — DM Mono: the signature face for stamped hyperlocal data (distance, status)
const display = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});
const body = Public_Sans({ subsets: ['latin'], variable: '--font-public', display: 'swap' });
const mono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dmmono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Neighborly — borrow, lend & trade nearby',
  description: 'A hyperlocal marketplace where neighbors buy, sell, or loan tools and goods.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Set the theme before paint to avoid a flash: honor a saved choice,
            else fall back to the OS preference. Mirrors ThemeToggle. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
      </head>
      {/* suppressHydrationWarning: browser extensions (Grammarly, password managers)
          inject attributes onto <body> before hydration; scoped to this element only. */}
      <body className="font-sans min-h-screen" suppressHydrationWarning>
        <AuthProvider>
          <ConversationsProvider>
            <LoansProvider>
              <Navbar />
              <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
            </LoansProvider>
          </ConversationsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
