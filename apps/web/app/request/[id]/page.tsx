'use client';

import React, { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAppContext } from '@/lib/providers/AppProvider';
import StatusBadge from '@/components/StatusBadge';
import { ArrowLeft, MapPin, User, CheckCircle, AlertTriangle, XCircle, Terminal } from 'lucide-react';
import { InteractionLog } from '@/lib/types';

const LogItem: React.FC<{ log: InteractionLog; index: number }> = ({ log }) => {
  const iconMap = {
    success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    error: <XCircle className="w-5 h-5 text-red-400" />,
    info: <Terminal className="w-5 h-5 text-blue-400" />
  };

  return (
    <div className="relative pl-8 pb-8 last:pb-0 animate-fadeIn">
      {/* Timeline connector */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-surface-highlight last:hidden" />

      <div className="absolute left-0 top-1 bg-surface p-1 rounded-full border border-surface-highlight shadow-sm z-10">
        {iconMap[log.status]}
      </div>

      <div className="bg-surface rounded-xl border border-surface-highlight shadow-sm p-5 hover:border-primary-500/30 transition-shadow">
        <div className="flex justify-between items-start mb-2">
          <h4 className="font-bold text-slate-200">{log.stepName}</h4>
          <span className="text-xs text-slate-500 font-mono">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-slate-400 mb-3">{log.detail}</p>

        {log.transcript && (
          <div className="bg-abyss/50 rounded-lg p-4 border border-surface-highlight space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Transcript</p>
            {log.transcript.map((line, idx) => (
              <div key={idx} className={`flex gap-3 text-sm ${line.speaker === 'AI' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${line.speaker === 'AI'
                    ? 'bg-primary-600/20 text-primary-200 border border-primary-500/20 rounded-tr-none'
                    : 'bg-surface-highlight border border-surface-highlight text-slate-300 rounded-tl-none shadow-sm'
                  }`}>
                  <span className="block text-xs opacity-75 mb-1 font-bold">{line.speaker}</span>
                  {line.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default function RequestDetails() {
  const params = useParams();
  const id = params.id as string;
  const { requests } = useAppContext();
  const request = requests.find(r => r.id === id);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto scroll to bottom when new logs arrive
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [request?.interactions.length]);

  if (!request) return <div className="text-center p-10 text-slate-400">Request not found</div>;

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <Link href="/" className="inline-flex items-center text-slate-500 hover:text-slate-300 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Link>

      {/* Header Card */}
      <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <h1 className="text-2xl font-bold text-slate-100">{request.title}</h1>
          <StatusBadge status={request.status} />
        </div>

        <p className="text-slate-400 mb-6">{request.description}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          {request.location && (
            <div className="flex items-center gap-2 text-slate-400">
              <MapPin className="w-4 h-4 text-slate-500" />
              {request.location}
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-semibold text-slate-300">Criteria:</span> {request.criteria}
          </div>
        </div>

        {request.selectedProvider && (
          <div className="mt-6 p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl flex items-start gap-4">
            <div className="bg-primary-500/20 rounded-full p-2 text-primary-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-primary-300">Provider Selected & Booked</h3>
              <p className="text-primary-400/80 text-sm mt-1">
                {request.selectedProvider.name} has been secured.
                {request.selectedProvider.address && ` Located at ${request.selectedProvider.address}.`}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Timeline */}
        <div className="lg:col-span-2">
          <h3 className="text-lg font-bold text-slate-100 mb-4">Activity Log</h3>
          <div className="bg-abyss/30 p-6 rounded-2xl border border-surface-highlight min-h-[400px]">
            {request.interactions.length === 0 && (
              <div className="text-center text-slate-500 py-10">Initializing AI Agent...</div>
            )}
            {request.interactions.map((log, i) => (
              <LogItem key={i} log={log} index={i} />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {request.providersFound.length > 0 && (
            <div className="bg-surface rounded-xl border border-surface-highlight shadow-sm p-5">
              <h3 className="font-bold text-slate-200 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" /> Candidates
              </h3>
              <div className="space-y-3">
                {request.providersFound.map(p => (
                  <div key={p.id} className={`text-sm p-3 rounded-lg border ${request.selectedProvider?.id === p.id ? 'bg-primary-500/10 border-primary-500/30 ring-1 ring-primary-500/30' : 'bg-surface-highlight border-surface-highlight'}`}>
                    <div className="font-medium text-slate-200">{p.name}</div>
                    <div className="text-slate-500 text-xs mt-1">{p.rating} ★ • {p.source}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {request.directContactInfo && (
            <div className="bg-surface rounded-xl border border-surface-highlight shadow-sm p-5">
              <h3 className="font-bold text-slate-200 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" /> Target Contact
              </h3>
              <div className="text-sm">
                <p className="font-medium text-slate-300">{request.directContactInfo.name}</p>
                <p className="text-slate-500">{request.directContactInfo.phone}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
