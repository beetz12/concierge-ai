"use client";

import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { ServiceRequest } from "../types";

interface AppContextType {
  requests: ServiceRequest[];
  addRequest: (req: ServiceRequest) => void;
  updateRequest: (id: string, updates: Partial<ServiceRequest>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppContext must be used within AppProvider");
  return context;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    const saved = localStorage.getItem("concierge_requests");
    if (saved) {
      try {
        setRequests(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved requests:", e);
      }
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage whenever requests change (after hydration)
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("concierge_requests", JSON.stringify(requests));
    }
  }, [requests, isHydrated]);

  const addRequest = (req: ServiceRequest) => {
    setRequests((prev) => {
      // Check if request with same ID already exists
      const existingIndex = prev.findIndex((r) => r.id === req.id);
      if (existingIndex !== -1) {
        // Update existing request instead of adding duplicate
        const updated = [...prev];
        updated[existingIndex] = { ...prev[existingIndex], ...req };
        return updated;
      }
      // Add new request at the beginning
      return [req, ...prev];
    });
  };

  const updateRequest = (id: string, updates: Partial<ServiceRequest>) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    );
  };

  return (
    <AppContext.Provider value={{ requests, addRequest, updateRequest }}>
      {children}
    </AppContext.Provider>
  );
}
