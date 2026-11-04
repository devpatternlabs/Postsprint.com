import type { Metadata } from "next";
import "./globals.css";

const googleVerificationCode =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
  process.env.GOOGLE_SITE_VERIFICATION ||
  "google5cdf2c3225b497ac";

export const metadata: Metadata = {
  title: "BEWEB Social Automation",
  description:
    "BEWEB Social Automation helps users securely connect and publish content to YouTube, Facebook and Instagram from one dashboard.",
  verification: {
    google: googleVerificationCode,
  },
};

import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <meta name="google-site-verification" content={googleVerificationCode} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('beweb_theme');
                  var isDark = true;
                  if (stored === 'light') {
                    isDark = false;
                  } else if (stored === 'system') {
                    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  } else if (stored === 'dark') {
                    isDark = true;
                  }
                  var root = document.documentElement;
                  if (isDark) {
                    root.classList.add('dark');
                    root.classList.remove('light');
                    root.setAttribute('data-theme', 'dark');
                    root.style.colorScheme = 'dark';
                  } else {
                    root.classList.remove('dark');
                    root.classList.add('light');
                    root.setAttribute('data-theme', 'light');
                    root.style.colorScheme = 'light';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased selection:bg-indigo-500/30 selection:text-indigo-200 transition-colors duration-200">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
