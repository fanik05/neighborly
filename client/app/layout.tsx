import type { Metadata } from 'next';
import { Space_Grotesk, Hanken_Grotesk, Space_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ConversationsProvider } from '@/lib/useConversations';
import { LoansProvider } from '@/lib/useLoans';
import Navbar from '@/components/Navbar';

// "Neighborhood Wayfinding" type system:
// — Space Grotesk: geometric wayfinding-style display
// — Hanken Grotesk: warm, highly legible body
// — Space Mono: hyperlocal data (price, distance, status) like map coordinates/signage
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-grotesk',
  display: 'swap',
});
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });
const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-spacemono',
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
      className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}
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
