import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/providers/AuthProvider";
import { AppProvider } from "@/lib/providers/AppProvider";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Concierge - AI that makes your calls",
  description:
    "Concierge places real, recorded phone calls on your behalf to screen contractors, chase refunds, negotiate bills, and resolve disputes. You approve every call, then get the recording, transcript, and outcome.",
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
