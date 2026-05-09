import type { Metadata } from 'next'
import './globals.css'
import { DesignProvider } from '@/components/theme/DesignProvider'

export const metadata: Metadata = {
  title: 'LL Cockpit | NEXUS PRIME',
  description: 'Leadership Legacy Digital — AI Cockpit',
}

// All fonts referenced in typography dropdowns must be loaded here
const GOOGLE_FONTS = [
  'Barlow:wght@400;500;600',
  'Barlow+Condensed:wght@400;600;700',
  'JetBrains+Mono:wght@400;500;600',
  'Inter:wght@300;400;500;600',
  'Space+Grotesk:wght@300;400;500;600;700',
  'DM+Sans:wght@300;400;500;600',
  'Outfit:wght@300;400;500;600;700',
  'Nunito:wght@300;400;500;600',
  'Poppins:wght@300;400;500;600',
  'Fira+Code:wght@400;500',
  'Source+Code+Pro:wght@400;500',
  'IBM+Plex+Mono:wght@400;500',
].join('&family=')

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href={`https://fonts.googleapis.com/css2?family=${GOOGLE_FONTS}&display=swap`}
          rel="stylesheet"
        />
      </head>
      <body className="antialiased h-full">
        <DesignProvider>{children}</DesignProvider>
      </body>
    </html>
  )
}
