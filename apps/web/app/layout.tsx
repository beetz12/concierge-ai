import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/providers/AppProvider";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
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
      <body className="overflow-hidden">
        <AppProvider>
          <SidebarProvider defaultOpen={true}>
            <AppSidebar />
            <SidebarInset className="flex flex-col min-h-svh max-h-svh overflow-hidden">
              <MobileHeader />
              <main className="flex-1 overflow-y-auto">
                {children}
              </main>
            </SidebarInset>
          </SidebarProvider>
          <Toaster position="top-right" theme="dark" richColors closeButton />
        </AppProvider>
      </body>
    </html>
  );
}
