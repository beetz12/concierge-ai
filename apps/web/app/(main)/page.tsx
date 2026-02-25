"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  Phone,
  Search,
  CheckCircle,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SplashScreen } from "@/components/SplashScreen";

const HeroSection: React.FC = () => (
  <section
    className="relative overflow-hidden rounded-3xl border border-surface-highlight shadow-2xl mb-8"
    aria-labelledby="hero-title"
  >
    {/* Gradient Background */}
    <div className="absolute inset-0 bg-gradient-to-br from-teal-900/40 via-purple-900/40 to-slate-900/40" />
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-500/20 via-transparent to-transparent" />

    <div className="relative p-12 lg:p-16">
      <div className="max-w-4xl mx-auto text-center">
        {/* Main Headline */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/10 border border-teal-500/20 rounded-full mb-6">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span className="text-teal-300 text-sm font-medium">
            Powered by AI & Real Phone Calls
          </span>
        </div>

        <h1
          id="hero-title"
          className="text-5xl lg:text-6xl font-bold text-slate-100 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-teal-300 via-purple-300 to-teal-300"
        >
          Your AI Concierge Finds & Books Service Providers
        </h1>

        <p className="text-xl text-slate-300 mb-12 max-w-2xl mx-auto leading-relaxed">
          Tell us what you need. Our AI researches providers, makes concurrent
          phone calls to check availability and rates, then recommends the top 3
          options. You pick the best.
        </p>

        {/* 4-Step Flow */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-surface/50 backdrop-blur-sm p-6 rounded-2xl border border-surface-highlight hover:border-teal-500/30 transition-all duration-300">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-slate-100 mb-2">1. Tell Us</h3>
            <p className="text-sm text-slate-400">
              Describe what service you need and where
            </p>
          </div>

          <div className="bg-surface/50 backdrop-blur-sm p-6 rounded-2xl border border-surface-highlight hover:border-purple-500/30 transition-all duration-300">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <Search className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-slate-100 mb-2">2. AI Research</h3>
            <p className="text-sm text-slate-400">
              We find qualified providers in your area
            </p>
          </div>

          <div className="bg-surface/50 backdrop-blur-sm p-6 rounded-2xl border border-surface-highlight hover:border-blue-500/30 transition-all duration-300">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-slate-100 mb-2">3. Live Calls</h3>
            <p className="text-sm text-slate-400">
              Concurrent calls check availability & rates
            </p>
          </div>

          <div className="bg-surface/50 backdrop-blur-sm p-6 rounded-2xl border border-surface-highlight hover:border-emerald-500/30 transition-all duration-300">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-slate-100 mb-2">4. You Choose</h3>
            <p className="text-sm text-slate-400">
              Pick from top 3 AI-recommended options
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <Link
          href="/new"
          className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-teal-500 to-teal-600 text-white text-lg font-semibold rounded-xl hover:from-teal-600 hover:to-teal-700 transition-all duration-300 shadow-xl shadow-teal-500/30 hover:shadow-2xl hover:shadow-teal-500/40 hover:scale-105"
        >
          Start Your First Request
          <ArrowRight className="w-5 h-5" />
        </Link>

        {/* Sponsor Technologies */}
        <div className="mt-12 pt-8 border-t border-surface-highlight">
          <p className="text-slate-500 text-sm mb-4">Powered by</p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="text-slate-400 font-semibold text-sm">
              Vercel Hosting
            </div>
            <div className="text-slate-400 font-semibold text-sm">
              VAPI Voice AI
            </div>
            <div className="text-slate-400 font-semibold text-sm">
              Google Gemini
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default function Home() {
  const [splashComplete, setSplashComplete] = useState(false);

  // Show splash screen every time the homepage loads
  if (!splashComplete) {
    return <SplashScreen onComplete={() => setSplashComplete(true)} duration={1800} />;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader />
      <HeroSection />
    </div>
  );
}
