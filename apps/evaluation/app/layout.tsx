import type { Metadata } from "next";
import "./globals.css";

// The request-specific CSP nonce cannot be embedded in statically built HTML.
// Keep all workbenches interactive under the production security policy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Counsel Physician Review Instrument",
  description: "Blinded case-by-case physician reference authoring, comparison, and evaluation for a synthetic disposition workflow.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
