import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Chess Advisor Platform",
  description: "A premium platform to analyze and improve your chess games",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme before JS hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('theme');
                if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', t);
              } catch(e){}
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <PlayerProvider>
            <ThemeProvider>
              <SettingsProvider>
                <div className="bg-grid" />
                <div
                  className="page-wrapper"
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100vh",
                  }}
                >
                  <div
                    style={{ flex: 1, display: "flex", flexDirection: "column" }}
                  >
                    {children}
                  </div>
                  <Footer />
                </div>
              </SettingsProvider>
            </ThemeProvider>
          </PlayerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
