import type { Metadata } from 'next'
import './globals.css'
import { DesignProvider } from '@/components/theme/DesignProvider'

export const metadata: Metadata = {
  title: 'LL Cockpit | NEXUS PRIME',
  description: 'Leadership Legacy Digital — AI Cockpit',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Barlow+Condensed:wght@400;600;700&family=Barlow:wght@400;500;600&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased h-full">
        <DesignProvider>{children}</DesignProvider>
      </body>
    </html>
  )
}
