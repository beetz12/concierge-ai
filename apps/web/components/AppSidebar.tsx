"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  PlusCircle,
  PhoneCall,
  History,
  Info,
  Settings,
  Sparkles,
  ChevronLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/new", icon: PlusCircle, label: "New Request" },
  { href: "/direct", icon: PhoneCall, label: "Direct Task" },
  { href: "/history", icon: History, label: "History" },
  { href: "/about", icon: Info, label: "About" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const handleLinkClick = () => {
    // Close mobile sidebar when a link is clicked
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="relative">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            onClick={handleLinkClick}
            className={cn(
              "flex items-center gap-3 py-2",
              state === "collapsed" && !isMobile ? "justify-center px-0" : "px-1"
            )}
          >
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 font-bold text-primary-950 shadow-lg shadow-primary-500/30"
            >
              <Sparkles className="h-5 w-5" />
            </motion.div>
            {(state === "expanded" || isMobile) && (
              <span className="text-base font-semibold tracking-tight text-slate-100 whitespace-nowrap">
                ConciergeAI
              </span>
            )}
          </Link>
          {/* Mobile close button */}
          {isMobile && (
            <button
              onClick={() => setOpenMobile(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-highlight transition-colors"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </SidebarHeader>

      {/* Toggle arrow - desktop only, always at right edge */}
      {!isMobile && (
        <motion.button
          onClick={toggleSidebar}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="absolute top-5 -right-3 z-50 hidden md:flex h-6 w-6 items-center justify-center rounded-full bg-surface border border-slate-500 text-slate-100 hover:bg-primary-600 hover:border-primary-400 transition-colors shadow-lg cursor-pointer"
          title={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
        >
          <motion.div
            animate={{ rotate: state === "expanded" ? 0 : 180 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.div>
        </motion.button>
      )}

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item, index) => (
                <SidebarMenuItem key={item.href}>
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.2 }}
                  >
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.label}
                    >
                      <Link href={item.href} onClick={handleLinkClick}>
                        <item.icon className="transition-colors" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </motion.div>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" className="text-slate-400 hover:text-slate-100">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
