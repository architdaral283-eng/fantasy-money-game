import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Football Money Game — 2026/27",
  description: "Four players. Sixteen clubs. Nine competitions. Every rupee accounted for.",
};

const NAV: [string, string][] = [
  ["/", "Standings"],
  ["/fixtures/played", "Played"],
  ["/fixtures/remaining", "Remaining"],
  ["/clubs", "Clubs"],
  ["/h2h", "Head-to-Head"],
  ["/trophies", "Trophies"],
  ["/awards", "Awards"],
  ["/me", "You"],
  ["/constitution", "Constitution"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="masthead">
          <div className="wrap">
            <h1>The Record Book</h1>
            <p className="season">Fantasy Football Money Game, Season 2026/27</p>
            <nav>
              {NAV.map(([href, label]) => (
                <a key={href} href={href}>{label}</a>
              ))}
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="wrap foot">
          <p>Squads locked 20 August 2026. Four players. Append-only and permanent.</p>
        </footer>
      </body>
    </html>
  );
}
