"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles } from "lucide-react";

interface SplashScreenProps {
  onComplete?: () => void;
  duration?: number;
}

export function SplashScreen({
  onComplete,
  duration = 1800,
}: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950"
        >
          {/* Animated gradient background */}
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 1.2 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="absolute inset-0 bg-gradient-to-br from-teal-900/60 via-purple-900/40 to-slate-900"
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-teal-500/30 via-transparent to-transparent"
            />

            {/* Animated particles/sparkles effect */}
            <div className="absolute inset-0">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0],
                    x: [0, (i % 2 === 0 ? 1 : -1) * 30],
                    y: [0, -40],
                  }}
                  transition={{
                    duration: 1.5,
                    delay: 0.3 + i * 0.15,
                    ease: "easeOut",
                  }}
                  className="absolute w-2 h-2 bg-teal-400 rounded-full blur-sm"
                  style={{
                    left: `${45 + (i - 2.5) * 4}%`,
                    top: "55%",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Logo container */}
          <div className="relative flex flex-col items-center">
            {/* Logo icon */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{
                duration: 0.8,
                ease: [0.34, 1.56, 0.64, 1],
              }}
              className="relative mb-6"
            >
              {/* Glow effect */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute inset-0 w-24 h-24 bg-teal-500/30 rounded-2xl blur-xl"
              />

              {/* Icon container */}
              <div className="relative w-24 h-24 bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-teal-500/40">
                <Sparkles className="w-12 h-12 text-white" />
              </div>
            </motion.div>

            {/* Logo text */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-center"
            >
              <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-300 via-purple-300 to-teal-300">
                ConciergeAI
              </h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="text-slate-400 text-sm md:text-base mt-2"
              >
                Your AI-Powered Service Assistant
              </motion.p>
            </motion.div>

            {/* Loading indicator */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 1.2, delay: 0.5 }}
              className="mt-8 w-48 h-1 bg-slate-800 rounded-full overflow-hidden"
            >
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{
                  duration: 1,
                  delay: 0.6,
                  ease: "easeInOut",
                }}
                className="h-full w-full bg-gradient-to-r from-teal-500 via-purple-500 to-teal-500"
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
