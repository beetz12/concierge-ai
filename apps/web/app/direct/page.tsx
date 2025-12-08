'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/lib/providers/AppProvider';
import { RequestStatus, RequestType, ServiceRequest } from '@/lib/types';
import { Phone, User, MessageSquare, PhoneCall } from 'lucide-react';
import { simulateCall, scheduleAppointment } from '@/lib/services/geminiService';

export default function DirectTask() {
  const router = useRouter();
  const { addRequest, updateRequest } = useAppContext();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    task: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const newRequest: ServiceRequest = {
      id: `task-${Date.now()}`,
      type: RequestType.DIRECT_TASK,
      title: `Call ${formData.name}`,
      description: formData.task,
      criteria: "Complete the user's objective",
      status: RequestStatus.CALLING,
      createdAt: new Date().toISOString(),
      providersFound: [],
      interactions: [],
      directContactInfo: { name: formData.name, phone: formData.phone }
    };

    addRequest(newRequest);
    router.push(`/request/${newRequest.id}`);

    // Run Direct Process
    try {
      const log = await simulateCall(formData.name, formData.task, true);

      if (log.status === 'success') {
        let finalLogs = [log];
        let outcome = "Call completed successfully.";

        if (formData.task.toLowerCase().includes('schedule') || formData.task.toLowerCase().includes('appointment')) {
          const booking = await scheduleAppointment(formData.name, formData.task);
          finalLogs.push(booking);
          outcome = "Appointment scheduled.";
        }

        updateRequest(newRequest.id, {
          status: RequestStatus.COMPLETED,
          interactions: finalLogs,
          finalOutcome: outcome
        });
      } else {
        updateRequest(newRequest.id, {
          status: RequestStatus.FAILED,
          interactions: [log],
          finalOutcome: "Call did not result in a positive outcome."
        });
      }

    } catch (e) {
      updateRequest(newRequest.id, { status: RequestStatus.FAILED });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
          <PhoneCall className="text-primary-400" />
          Direct Task
        </h1>
        <p className="text-slate-400 mt-2">
          Give us a contact and a mission. The AI will make the call for you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface p-8 rounded-2xl border border-surface-highlight shadow-xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Contact Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
              <input
                type="text"
                required
                placeholder="e.g. Dr. Smith"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
              <input
                type="tel"
                required
                placeholder="(555) 123-4567"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            What should the AI do?
          </label>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
            <textarea
              required
              rows={4}
              placeholder="e.g. Call to reschedule my appointment to next Tuesday afternoon."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all resize-none bg-abyss text-slate-100 placeholder-slate-600"
              value={formData.task}
              onChange={e => setFormData({ ...formData, task: e.target.value })}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl shadow-lg shadow-primary-500/20 transition-all transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? 'Initiating Call...' : 'Execute Task'}
        </button>
      </form>
    </div>
  );
}
