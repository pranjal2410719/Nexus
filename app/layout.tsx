import type { Metadata } from "next";
import { BugReportModal } from "@/components/dashboard/bug-report-modal";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus — Open Source Commit Engine",
  description:
    "Nexus is an open-source, multi-tenant GitHub commit scheduler. Connect your repo, pick your bursts, stay active.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Analytics (gtag.js) — env-driven, defaults to author's property */}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <script async src={"https://www.googletagmanager.com/gtag/js?id=" + process.env.NEXT_PUBLIC_GA_ID} />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
                `,
              }}
            />
          </>
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Inter:wght@300;400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <BugReportModal />
      </body>
    </html>
  );
}
