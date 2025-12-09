"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  PhoneCall,
  History,
  Settings,
  Menu,
  X,
  Info,
} from "lucide-react";

const Sidebar: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/new", icon: PlusCircle, label: "New Request" },
    { href: "/direct", icon: PhoneCall, label: "Direct Task" },
    { href: "/history", icon: History, label: "History" },
    { href: "/about", icon: Info, label: "About" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-abyss text-slate-100 font-sans overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-surface text-slate-100 shadow-xl border-r border-surface-highlight">
        <div className="p-6 border-b border-surface-highlight flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center font-bold text-abyss shadow-lg shadow-primary-500/50">
            C
          </div>
          <span className="text-xl font-bold tracking-tight">ConciergeAI</span>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive(item.href)
                  ? "bg-primary-600/10 text-primary-400 border border-primary-500/20 shadow-md shadow-primary-500/10"
                  : "text-slate-400 hover:bg-surface-hover hover:text-slate-100"
              }`}
            >
              <item.icon
                className={`w-5 h-5 ${isActive(item.href) ? "text-primary-400" : "text-slate-400 group-hover:text-primary-400 transition-colors"}`}
              />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-surface-highlight">
          <button className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-slate-100 transition-colors w-full hover:bg-surface-hover rounded-xl">
            <Settings className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>
        </div>
      </aside>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 w-64 bg-surface text-slate-100 z-50 transform transition-transform duration-300 md:hidden border-r border-surface-highlight ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-6 flex justify-between items-center border-b border-surface-highlight">
          <span className="text-xl font-bold">ConciergeAI</span>
          <button onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-6 h-6 text-slate-400 hover:text-white" />
          </button>
        </div>
        <nav className="p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive(item.href)
                  ? "bg-primary-600/10 text-primary-400 border border-primary-500/20"
                  : "text-slate-400 hover:bg-surface-hover hover:text-slate-100"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-abyss">
        {/* Mobile Header */}
        <header className="md:hidden bg-surface border-b border-surface-highlight p-4 flex items-center justify-between shadow-sm">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="text-slate-400 hover:text-white"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-slate-100">ConciergeAI</span>
          <div className="w-6" />
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
};

export default Sidebar;
