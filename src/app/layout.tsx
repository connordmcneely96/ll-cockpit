export const runtime = 'edge'

import type { Metadata } from 'next'
import { JetBrains_Mono, Barlow_Condensed, Barlow } from 'next/font/google'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-condensed',
  display: 'swap',
})

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'LL Cockpit | NEXUS PRIME',
  description: 'Leadership Legacy Digital — AI Cockpit MVP',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} ${barlowCondensed.variable} ${barlow.variable}`}
    >
      <body className="bg-navy text-text1 antialiased h-full font-sans">{children}</body>
    </html>
  )
}
