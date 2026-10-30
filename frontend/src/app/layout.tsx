import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';
export const metadata: Metadata = { title: 'CampusOne ERP', description: 'College operations, connected.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            style: {
              background: 'var(--color-card)',
              color: 'var(--color-text)',
              borderColor: 'var(--color-border)',
            },
          }}
        />
      </body>
    </html>
  );
}
