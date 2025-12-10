"use client";

import React, { useEffect } from "react";
import { X, Phone, Calendar, Loader2 } from "lucide-react";

interface Props {
  provider: {
    providerName: string;
    phone: string;
    earliestAvailability: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const SelectionModal: React.FC<Props> = ({
  provider,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [loading, onCancel]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) {
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface border border-surface-highlight rounded-xl max-w-md w-full shadow-2xl animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-surface-highlight">
          <h2 className="text-xl font-bold text-slate-100">
            Confirm Booking
          </h2>
          {!loading && (
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Provider Details */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-100 mb-1">
                {provider.providerName}
              </h3>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Phone className="w-4 h-4" />
                <span>{provider.phone}</span>
              </div>
            </div>

            <div className="bg-abyss/50 border border-surface-highlight rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-primary-400" />
                <div>
                  <span className="text-slate-500">Available: </span>
                  <span className="text-slate-300 font-medium">
                    {provider.earliestAvailability}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="bg-primary-500/10 border border-primary-500/20 rounded-lg p-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              Our AI will call them now to schedule your appointment
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-surface-hover border border-surface-highlight text-slate-300 rounded-lg font-semibold hover:bg-surface hover:text-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Booking...</span>
                </>
              ) : (
                "Confirm & Book"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectionModal;
