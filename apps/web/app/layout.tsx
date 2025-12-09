import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/providers/AppProvider";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "ConciergeAI - Your AI Receptionist",
  description:
    "AI-powered assistant that researches local service providers and books appointments on your behalf",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <Sidebar>{children}</Sidebar>
        </AppProvider>
      </body>
    </html>
  );
}
