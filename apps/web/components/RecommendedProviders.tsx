"use client";

import React from "react";
import { Star, CheckCircle, Phone, Calendar, Loader2 } from "lucide-react";

interface Provider {
  providerId: string;
  providerName: string;
  phone: string;
  rating: number;
  reviewCount?: number;
  earliestAvailability: string;
  estimatedRate: string;
  score: number;
  reasoning: string;
  criteriaMatched?: string[];
}

interface Props {
  providers: Provider[];
  overallRecommendation: string;
  onSelect: (provider: Provider) => void;
  loading?: boolean;
  selectedId?: string;
}

const RecommendedProviders: React.FC<Props> = ({
  providers,
  overallRecommendation,
  onSelect,
  loading = false,
  selectedId,
}) => {
  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i < Math.floor(rating)
                ? "fill-amber-400 text-amber-400"
                : "text-slate-600"
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        <p className="text-slate-400 text-sm">
          Generating recommendations with AI...
        </p>
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="bg-surface border border-surface-highlight rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Phone className="w-8 h-8 text-slate-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-300 mb-2">
          No Qualified Providers Found
        </h3>
        <p className="text-slate-400 text-sm">
          Unfortunately, none of the providers met your requirements. Try
          adjusting your criteria or location.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Recommendation */}
      {overallRecommendation && (
        <div className="bg-primary-500/10 border border-primary-500/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-primary-400 mb-2">
            AI Recommendation Summary
          </h3>
          <p className="text-sm text-slate-300">{overallRecommendation}</p>
        </div>
      )}

      {/* Provider Cards */}
      <div className="space-y-4">
        {providers.map((provider, index) => (
          <div
            key={provider.providerId}
            className={`bg-surface border rounded-xl p-6 transition-all duration-200 ${
              selectedId === provider.providerId
                ? "border-primary-500 shadow-lg shadow-primary-500/20"
                : "border-surface-highlight hover:border-primary-500/50"
            }`}
          >
            {/* Header with Badge */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-slate-100">
                    {provider.providerName}
                  </h3>
                  {index === 0 && (
                    <div className="px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-xs font-bold text-amber-400">
                      🏆 BEST MATCH
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <div className="flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    <span>{provider.phone}</span>
                  </div>
                  {provider.reviewCount && (
                    <span>({provider.reviewCount} reviews)</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary-400 mb-1">
                  {provider.score}
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">
                  Score
                </div>
              </div>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-2 mb-4">
              {renderStars(provider.rating)}
              <span className="text-sm font-medium text-slate-300">
                {provider.rating.toFixed(1)}
              </span>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-primary-400" />
                <div>
                  <span className="text-slate-500">Available: </span>
                  <span className="text-slate-300 font-medium">
                    {provider.earliestAvailability}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Rate: </span>
                <span className="text-slate-300 font-medium">
                  {provider.estimatedRate}
                </span>
              </div>
            </div>

            {/* AI Reasoning */}
            <div className="bg-abyss/50 border border-surface-highlight rounded-lg p-4 mb-4">
              <h4 className="text-xs font-semibold text-primary-400 uppercase tracking-wide mb-2">
                AI Analysis
              </h4>
              <p className="text-sm text-slate-300 leading-relaxed">
                {provider.reasoning}
              </p>
            </div>

            {/* Criteria Matched */}
            {provider.criteriaMatched && provider.criteriaMatched.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {provider.criteriaMatched.map((criteria, i) => (
                  <div
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-xs font-medium text-emerald-400"
                  >
                    <CheckCircle className="w-3 h-3" />
                    <span>{criteria}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Select Button */}
            <button
              onClick={() => onSelect(provider)}
              disabled={selectedId === provider.providerId}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${
                selectedId === provider.providerId
                  ? "bg-primary-600 text-white cursor-default"
                  : "bg-primary-600/10 text-primary-400 border border-primary-500/30 hover:bg-primary-600 hover:text-white hover:shadow-lg hover:shadow-primary-500/20"
              }`}
            >
              {selectedId === provider.providerId
                ? "Selected"
                : "Select This Provider"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecommendedProviders;
