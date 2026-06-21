import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import Navbar from '@/components/Navbar';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});
const body = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Neighborly — borrow, lend & trade nearby',
  description: 'A hyperlocal marketplace where neighbors buy, sell, or loan tools and goods.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      {/* suppressHydrationWarning: browser extensions (Grammarly, password managers)
          inject attributes onto <body> before hydration; scoped to this element only. */}
      <body className="font-sans min-h-screen" suppressHydrationWarning>
        <AuthProvider>
          <Navbar />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
