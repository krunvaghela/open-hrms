import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Open HRMS · Your people, in one place',
  description: 'A thoughtful workspace for your people and everyday HR.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
