import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for greetings and big numbers: warm and human, never shouty.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  // Italic for quoted policy wording and pencilled-in questions on Your cover.
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Cabinet",
  description: "All your insurance in one place, explained simply.",
  applicationName: "Cabinet",
};

export const viewport: Viewport = {
  themeColor: "#f4f1ec",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
