import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SignX Reach',
  description: 'Cold outreach automation for agencies',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
