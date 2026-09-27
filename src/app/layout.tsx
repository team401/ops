import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { withBasePath } from "@/lib/base-path";

export const metadata: Metadata = {
  title: {
    default: "401 Ops",
    template: "%s | 401 Ops",
  },
  description:
    "Team 401's operations hub for projects, people, attendance, and inventory",

  icons: {
    apple: withBasePath("/apple-touch-icon.png"),
  },

  manifest: withBasePath("/manifest.webmanifest"),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body
        className="min-h-full flex flex-col"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <Providers>{children}</Providers>
        <Script id="team401-theme" strategy="beforeInteractive">
          {`try{const saved=localStorage.getItem('team401-theme');const theme=saved==='light'||saved==='dark'?saved:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme}catch{}`}
        </Script>
      </body>
    </html>
  );
}
