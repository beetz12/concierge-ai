"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

export interface BreadcrumbItem {
  label: string;
  href: string;
  isCurrentPage: boolean;
}

const routeLabels: Record<string, string> = {
  "": "Dashboard",
  new: "New Request",
  direct: "Direct Task",
  history: "History",
  about: "About",
  request: "Request",
  settings: "Settings",
};

export function useBreadcrumbs(): BreadcrumbItem[] {
  const pathname = usePathname();

  return useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);

    // Always start with Dashboard
    const breadcrumbs: BreadcrumbItem[] = [
      {
        label: "Dashboard",
        href: "/",
        isCurrentPage: pathname === "/",
      },
    ];

    // If we're on the dashboard, just return it
    if (segments.length === 0) {
      return breadcrumbs;
    }

    // Build breadcrumbs from path segments
    let currentPath = "";
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === segments.length - 1;

      // Check if it's a dynamic segment (like a UUID)
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          segment
        );

      let label = routeLabels[segment] || segment;

      // For UUIDs, use a more readable label
      if (isUUID) {
        label = `#${segment.slice(0, 8)}`;
      }

      breadcrumbs.push({
        label,
        href: currentPath,
        isCurrentPage: isLast,
      });
    });

    return breadcrumbs;
  }, [pathname]);
}
