import { AppSidebar } from "@/components/AppSidebar";
import { DemoBanner } from "@/components/DemoBanner";
import { MobileHeader } from "@/components/MobileHeader";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ensureOrganization } from "@/lib/actions/organizations";

/**
 * Main app layout with sidebar
 * Used for authenticated pages (dashboard, new, history, etc.)
 */
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Org auto-create on first sign-in: idempotent, no-op when signed out.
  // Onboarding failures must not take down page rendering; the org switcher
  // and request actions surface the error where it matters.
  try {
    await ensureOrganization();
  } catch {
    // Intentionally swallowed; see above.
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-svh max-h-svh overflow-hidden">
        <DemoBanner />
        <MobileHeader />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
