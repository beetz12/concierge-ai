import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/providers/AuthProvider";
import { AppProvider } from "@/lib/providers/AppProvider";
import { Toaster } from "sonner";

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
      <body className="overflow-hidden bg-abyss">
        <AuthProvider>
          <AppProvider>
            {children}
            <Toaster position="top-right" theme="dark" richColors closeButton />
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
