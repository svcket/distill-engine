import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Distill | Editorial Engine",
  description: "Internal dashboard for knowledge distillation",
};

import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { Providers } from "@/components/providers/Providers";
import { AuthLayoutWrapper } from "@/components/layout/AuthLayoutWrapper";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        {process.env.NEXT_PUBLIC_IS_BETA !== 'true' && (
          <script src="https://js.paystack.co/v1/inline.js" async></script>
        )}
      </head>
      <body className={`font-sans`}>
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            forcedTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            <Providers>
              <LanguageProvider>
                <AuthLayoutWrapper>
                   {children}
                </AuthLayoutWrapper>
              </LanguageProvider>
            </Providers>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
