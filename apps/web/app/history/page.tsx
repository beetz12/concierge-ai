'use client';

import React from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import { Calendar, MapPin } from 'lucide-react';
import { useAppContext } from '@/lib/providers/AppProvider';

export default function RequestHistory() {
  const { requests } = useAppContext();

  // Sort by newest first
  const sorted = [...requests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-100 mb-8">Request History</h1>

      <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl overflow-hidden">
        {sorted.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            No history found.
          </div>
        ) : (
          <div className="divide-y divide-surface-highlight">
            {sorted.map((req) => (
              <div key={req.id} className="p-6 hover:bg-surface-hover transition-colors">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <StatusBadge status={req.status} size="sm" />
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(req.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <Link href={`/request/${req.id}`} className="group">
                      <h3 className="text-lg font-bold text-slate-100 group-hover:text-primary-400 transition-colors mb-1">
                        {req.title}
                      </h3>
                    </Link>
                    <p className="text-slate-400 text-sm mb-2">{req.description}</p>
                    {req.location && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="w-3 h-3" /> {req.location}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    {req.selectedProvider && (
                      <div className="hidden md:block text-right">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Booked With</span>
                        <span className="text-sm font-medium text-primary-400">{req.selectedProvider.name}</span>
                      </div>
                    )}
                    <Link
                      href={`/request/${req.id}`}
                      className="px-4 py-2 bg-surface-highlight text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-700/50 hover:text-white transition-colors border border-surface-highlight hover:border-slate-600"
                    >
                      View Log
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
