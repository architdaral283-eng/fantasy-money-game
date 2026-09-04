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
  ["/ledger", "Ledger"],
  ["/awards", "Awards"],
  ["/settle", "Settle"],
  ["/weekly", "Weekly"],
  ["/constitution", "Constitution"],
  ["/commissioner", "Commissioner"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <div className="wrap">
            <p className="kicker">Fantasy Football Money Game · Season 2026/27</p>
            <h1>The Record Book</h1>
            <nav>
              {NAV.map(([href, label]) => (
                <a key={href} href={href}>{label}</a>
              ))}
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="wrap foot">
          <p>Squads locked 20 August 2026 · Archit, Vedant, Harshal, Anmol · Append-only and permanent.</p>
        </footer>
      </body>
    </html>
  );
}
