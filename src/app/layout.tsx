import type { Metadata } from "next";
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
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
