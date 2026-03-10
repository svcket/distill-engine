import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-serif", weight: ['400', '500', '600', '700', '800'] });

export const metadata: Metadata = {
  title: "Distill | Editorial Engine",
  description: "Internal dashboard for knowledge distillation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className={`${inter.variable} ${serif.variable} font-sans`}>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
