import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://transparentape.app"),
  title: {
    default: "Transparentape · Obras públicas Perú",
    template: "%s · Transparentape",
  },
  description:
    "Mapa abierto de obras públicas en Perú con detección automática de irregularidades. Datos OCDS + OECE.",
  applicationName: "Transparentape",
  openGraph: {
    title: "Transparentape",
    description: "El billete deja huella. Lo grabamos.",
    type: "website",
    locale: "es_PE",
    siteName: "Transparentape",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Transparentape",
    description: "El billete deja huella. Lo grabamos.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--ink-0)] text-[var(--fg)] overflow-hidden">
        {children}
      </body>
    </html>
  );
}
