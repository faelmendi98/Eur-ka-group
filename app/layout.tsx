import type { Metadata } from "next";
import "./globals.css";
import "./overrides.css";
import "./quote-popup.css";
import "./mandate-parameters.css";
import "./mvp-documents.css";
import "./freelance-summary.css";
import "./account-menu.css";
import "./account-placement.css";
import "./document-templates.css";
import "./document-types.css";
import "./standards-library.css";
import "./simple-tools.css";
import "./quote-document.css";
import "./quote-stage-documents.css";
import "./share-upload.css";
import "./admin-mvp.css";

export const metadata: Metadata = {
  title: "Eurêka Group — MVP Documents",
  description: "Version MVP construite depuis la maquette complète Eurêka Group.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
