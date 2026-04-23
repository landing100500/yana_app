import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ЯСНА - ИИ Психолог-предсказатель',
  description:
    'Ясность и решение любой ситуации, твои 60 минут в подарок. Ведическая карта + подсознание',
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

