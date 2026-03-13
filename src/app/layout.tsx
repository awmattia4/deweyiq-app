import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ThemeToaster } from "@/components/shell/theme-toaster"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    template: "%s | PoolCo",
    default: "PoolCo — Pool Service Management",
  },
  description: "The all-in-one platform for pool service companies. Route management, water chemistry, invoicing, and customer portal in one app.",
  applicationName: "PoolCo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PoolCo",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0ea5e9" },
    { media: "(prefers-color-scheme: light)", color: "#0ea5e9" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        {children}
        <ThemeToaster />
      </body>
    </html>
  )
}
