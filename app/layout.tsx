import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ЯСНА - Астрология и натальные карты',
  description: 'Консультации по астрологии, натальным картам и эзотерике',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}

