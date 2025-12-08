'use client';

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { ServiceRequest } from '../types';

interface AppContextType {
  requests: ServiceRequest[];
  addRequest: (req: ServiceRequest) => void;
  updateRequest: (id: string, updates: Partial<ServiceRequest>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    const saved = localStorage.getItem('concierge_requests');
    if (saved) {
      try {
        setRequests(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved requests:', e);
      }
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage whenever requests change (after hydration)
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('concierge_requests', JSON.stringify(requests));
    }
  }, [requests, isHydrated]);

  const addRequest = (req: ServiceRequest) => {
    setRequests(prev => [req, ...prev]);
  };

  const updateRequest = (id: string, updates: Partial<ServiceRequest>) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  return (
    <AppContext.Provider value={{ requests, addRequest, updateRequest }}>
      {children}
    </AppContext.Provider>
  );
}
