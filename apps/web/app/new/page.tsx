'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/lib/providers/AppProvider';
import { RequestStatus, RequestType, ServiceRequest } from '@/lib/types';
import { Search, MapPin, AlertCircle, Sparkles } from 'lucide-react';
import { searchProviders, simulateCall, selectBestProvider, scheduleAppointment } from '@/lib/services/geminiService';

export default function NewRequest() {
  const router = useRouter();
  const { addRequest, updateRequest } = useAppContext();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    criteria: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const newRequest: ServiceRequest = {
      id: `req-${Date.now()}`,
      type: RequestType.RESEARCH_AND_BOOK,
      title: formData.title,
      description: formData.description,
      location: formData.location,
      criteria: formData.criteria,
      status: RequestStatus.SEARCHING,
      createdAt: new Date().toISOString(),
      providersFound: [],
      interactions: [],
    };

    addRequest(newRequest);
    router.push(`/request/${newRequest.id}`);

    // Start background process
    runConciergeProcess(newRequest.id, formData);
  };

  const runConciergeProcess = async (reqId: string, data: typeof formData) => {
    try {
      // 1. Search
      const searchResult = await searchProviders(data.title, data.location);
      updateRequest(reqId, {
        providersFound: searchResult.providers,
        interactions: [searchResult.logs]
      });

      if (searchResult.providers.length === 0) {
        updateRequest(reqId, { status: RequestStatus.FAILED });
        return;
      }

      // 2. Call Loop
      updateRequest(reqId, { status: RequestStatus.CALLING });
      const callLogs = [];

      for (const provider of searchResult.providers) {
        const log = await simulateCall(provider.name, `${data.description}. Criteria: ${data.criteria}`, false);
        callLogs.push(log);
        updateRequest(reqId, {
          interactions: [searchResult.logs, ...callLogs]
        });
        await new Promise(r => setTimeout(r, 1000));
      }

      // 3. Analyze
      updateRequest(reqId, { status: RequestStatus.ANALYZING });
      const analysis = await selectBestProvider(data.title, callLogs, searchResult.providers);

      const finalLogs = [...callLogs, {
        timestamp: new Date().toISOString(),
        stepName: "Analysis & Selection",
        detail: analysis.reasoning,
        status: analysis.selectedId ? 'success' : 'warning'
      } as any];

      updateRequest(reqId, { interactions: [searchResult.logs, ...finalLogs] });

      if (analysis.selectedId) {
        // 4. Schedule
        const provider = searchResult.providers.find(p => p.id === analysis.selectedId);
        if (provider) {
          updateRequest(reqId, { selectedProvider: provider });
          const bookingLog = await scheduleAppointment(provider.name, data.description);
          updateRequest(reqId, {
            status: RequestStatus.COMPLETED,
            interactions: [searchResult.logs, ...finalLogs, bookingLog],
            finalOutcome: `Booked with ${provider.name}. ${analysis.reasoning}`
          });
        }
      } else {
        updateRequest(reqId, {
          status: RequestStatus.FAILED,
          finalOutcome: "Could not find a suitable provider matching all criteria."
        });
      }

    } catch (e) {
      console.error(e);
      updateRequest(reqId, { status: RequestStatus.FAILED });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
          <Sparkles className="text-primary-400" />
          New Research Request
        </h1>
        <p className="text-slate-400 mt-2">
          Tell us what you need. We&apos;ll research local providers, call them to verify details, and book the best one.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface p-8 rounded-2xl border border-surface-highlight shadow-xl space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            What service do you need?
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
            <input
              type="text"
              required
              placeholder="e.g. Emergency Plumber, Dog Walker, Dentist"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Where are you located?
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
            <input
              type="text"
              required
              placeholder="e.g. Greenville, SC or Zip Code"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
              value={formData.location}
              onChange={e => setFormData({ ...formData, location: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Detailed Description
          </label>
          <textarea
            required
            rows={4}
            placeholder="Describe the issue in detail. e.g. I have a leaking toilet in the master bathroom that needs fixing ASAP."
            className="w-full px-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all resize-none bg-abyss text-slate-100 placeholder-slate-600"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Specific Criteria (Important)
          </label>
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl mb-3 flex items-start gap-3 text-sm text-blue-300">
            <AlertCircle className="w-5 h-5 shrink-0 text-blue-400" />
            <p>The AI will use these criteria when interviewing providers. Be specific about rating, availability, or price.</p>
          </div>
          <input
            type="text"
            required
            placeholder="e.g. 4.7+ stars, available within 2 days, licensed"
            className="w-full px-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
            value={formData.criteria}
            onChange={e => setFormData({ ...formData, criteria: e.target.value })}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl shadow-lg shadow-primary-500/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>Processing...</>
          ) : (
            <>Start Research & Booking <Sparkles className="w-5 h-5" /></>
          )}
        </button>
      </form>
    </div>
  );
}
