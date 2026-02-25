"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/PageHeader";
import {
  Terminal,
  Workflow,
  Brain,
  Globe,
  ShieldCheck,
  Zap,
  Cpu,
  Rocket,
  Search,
  Phone,
  Sparkles,
  CheckCircle,
  MapPin,
  MessageSquare,
  ExternalLink,
  Database,
  Users,
  Github,
} from "lucide-react";

// Dynamic import for FlowCanvas to avoid SSR issues with React Flow
const FlowCanvas = dynamic(
  () => import("@/components/FlowCanvas").then((mod) => mod.FlowCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[500px] md:h-[400px] bg-surface rounded-2xl border border-surface-highlight flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading flow diagram...</div>
      </div>
    ),
  }
);

const InfrastructureCanvas = dynamic(
  () => import("@/components/InfrastructureCanvas").then((mod) => mod.InfrastructureCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[500px] md:h-[400px] bg-surface rounded-2xl border border-surface-highlight flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading infrastructure diagram...</div>
      </div>
    ),
  }
);

// Product logos and links
const techStack = [
  {
    name: "Kestra",
    role: "The Orchestrator",
    fallbackIcon: <Workflow size={22} />,
    url: "https://kestra.io",
    description:
      "Orchestrating complex workflows and making critical decisions based on real-time system feedback.",
    color: "from-purple-500 to-violet-600",
  },
  {
    name: "VAPI",
    role: "The Voice",
    fallbackIcon: <Phone size={22} />,
    url: "https://vapi.ai",
    description:
      "Powers AI voice calls - real phone conversations with providers to verify availability.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    name: "Google Gemini",
    role: "The Brain",
    fallbackIcon: <Brain size={22} />,
    url: "https://ai.google.dev",
    description:
      "AI with Maps grounding to research, analyze, and recommend the best providers.",
    color: "from-blue-400 to-indigo-500",
  },
  {
    name: "Vercel",
    role: "The Stage",
    fallbackIcon: <Globe size={22} />,
    url: "https://vercel.com",
    description:
      "Instant global deployment. Live, accessible, and responsive anywhere.",
    color: "from-gray-400 to-gray-600",
  },
  {
    name: "Supabase",
    role: "The Memory",
    fallbackIcon: <Database size={22} />,
    url: "https://supabase.com",
    description:
      "Real-time database with PostgreSQL. Live subscriptions for instant updates.",
    color: "from-emerald-500 to-green-600",
  },
  {
    name: "CodeRabbit",
    role: "The Guardian",
    fallbackIcon: <ShieldCheck size={22} />,
    url: "https://coderabbit.ai",
    description:
      "Continuous code quality improvement. Clean, documented, and robust.",
    color: "from-orange-500 to-amber-500",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function AboutPage() {
  return (
    <div className="p-4 md:p-6 min-h-screen text-slate-100 selection:bg-primary-500/30 pb-8">
      <PageHeader
        title="About ConciergeAI"
        description="Learn how our AI-powered receptionist works"
      />

      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden w-full py-8 md:py-16 lg:py-20 px-2"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 md:h-96 bg-primary-500/10 blur-[100px] rounded-full pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="max-w-5xl mx-auto text-center relative z-10"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-highlight border border-primary-500/20 text-primary-400 text-xs md:text-sm font-medium mb-4 md:mb-6 shadow-[0_0_15px_-3px_rgba(45,212,191,0.2)]"
          >
            <Zap size={12} className="fill-primary-400" />
            <span>AI Agents Assemble Hackathon</span>
          </motion.div>

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 md:mb-6 px-2">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="block text-slate-100 mb-1 md:mb-2"
            >
              Your AI Receptionist
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-gradient-to-r from-primary-300 via-primary-400 to-primary-600 bg-clip-text text-transparent drop-shadow-sm"
            >
              That Actually Calls
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed px-4"
          >
            ConciergeAI researches local service providers, makes{" "}
            <span className="text-primary-300 font-semibold">
              real phone calls
            </span>{" "}
            to verify availability and rates, then recommends the{" "}
            <span className="text-primary-300 font-semibold">
              top 3 providers
            </span>
            .
          </motion.p>
        </motion.div>
      </motion.div>

      {/* Interactive Flow Canvas */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        variants={containerVariants}
        className="max-w-6xl mx-auto px-2 md:px-4 pb-12 md:pb-16"
      >
        <motion.div variants={itemVariants} className="text-center mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 md:mb-3">
            How It Works
          </h2>
          <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto px-4">
            From request to booking in minutes - explore the flow
          </p>
        </motion.div>

        <motion.div variants={itemVariants}>
          <FlowCanvas />
        </motion.div>
      </motion.div>

      {/* Infrastructure Canvas */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        variants={containerVariants}
        className="max-w-6xl mx-auto px-2 md:px-4 pb-12 md:pb-16"
      >
        <motion.div variants={itemVariants} className="text-center mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 md:mb-3">
            Development & Infrastructure
          </h2>
          <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto px-4">
            Built with modern tools for quality, reliability, and scale
          </p>
        </motion.div>

        <motion.div variants={itemVariants}>
          <InfrastructureCanvas />
        </motion.div>
      </motion.div>

      {/* Features Grid */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        variants={containerVariants}
        className="max-w-6xl mx-auto px-2 md:px-4 pb-12 md:pb-16"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <motion.div variants={itemVariants}>
            <FeatureCard
              icon={<Cpu className="text-primary-400" size={24} />}
              title="Beyond Prompts"
              description="Agents that understand context, negotiate outcomes, and take action in the real world."
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <FeatureCard
              icon={<Workflow className="text-primary-400" size={24} />}
              title="Autonomous Workflow"
              description="Multi-step processes without human intervention, orchestrated by intelligence."
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <FeatureCard
              icon={<Rocket className="text-primary-400" size={24} />}
              title="Real-Time Updates"
              description="Watch as your request progresses with live status updates and streaming results."
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Tech Stack */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        variants={containerVariants}
        className="max-w-6xl mx-auto px-2 md:px-4 pb-12 md:pb-16"
      >
        <motion.div variants={itemVariants} className="text-center mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 md:mb-3">
            Powered By
          </h2>
          <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto px-4">
            The modern AI stack powering our agentic architecture
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
          {techStack.map((tech) => (
            <motion.div key={tech.name} variants={itemVariants}>
              <TechCard {...tech} />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Use Cases */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        variants={containerVariants}
        className="max-w-6xl mx-auto px-2 md:px-4 pb-12 md:pb-16"
      >
        <motion.div variants={itemVariants} className="text-center mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 md:mb-3">
            What Can You Do?
          </h2>
          <p className="text-sm md:text-base text-slate-400 px-4">
            Two powerful ways to leverage AI-powered calling
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
          <motion.div variants={itemVariants}>
            <UseCaseCard
              badge="Research & Book"
              badgeIcon={<Search className="w-3 h-3" />}
              badgeColor="primary"
              title="Find Service Providers"
              description="Need a plumber, electrician, or any service? We search, call, compare, and recommend the top 3."
              features={[
                { icon: MapPin, text: "Location-aware search via Google Maps" },
                { icon: Phone, text: "Concurrent calls to multiple providers" },
                { icon: Sparkles, text: "AI-ranked recommendations" },
              ]}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <UseCaseCard
              badge="Direct Task"
              badgeIcon={<Phone className="w-3 h-3" />}
              badgeColor="blue"
              title="Single Call with AI"
              description="Have a specific call? Let AI handle it - negotiate bills, inquire, or follow up on orders."
              features={[
                { icon: MessageSquare, text: "Dynamic AI prompts for your task" },
                { icon: Brain, text: "Context-aware conversation" },
                { icon: CheckCircle, text: "Full transcript and summary" },
              ]}
            />
          </motion.div>
        </div>
      </motion.div>

      {/* Team Section */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        variants={containerVariants}
        className="max-w-6xl mx-auto px-2 md:px-4 pb-12 md:pb-16"
      >
        <motion.div variants={itemVariants} className="text-center mb-6 md:mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-highlight border border-primary-500/20 text-primary-400 text-xs md:text-sm font-medium mb-4">
            <Users size={14} />
            <span>Team NexAI</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-2 md:mb-3">
            Meet the Team
          </h2>
          <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto px-4">
            Built with passion for the AI Agents Assemble Hackathon
          </p>
        </motion.div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6">
          <motion.a
            variants={itemVariants}
            href="https://github.com/beetz12"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-4 bg-surface border border-surface-highlight rounded-xl p-4 md:p-5 hover:border-primary-500/30 transition-all duration-300 group cursor-pointer w-full sm:w-auto"
          >
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-xl md:text-2xl font-bold shadow-lg group-hover:shadow-primary-500/20 transition-all">
              D
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base md:text-lg font-bold text-slate-100 group-hover:text-primary-300 transition-colors">
                  David
                </h3>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                <Github size={14} />
                <span>beetz12</span>
              </div>
            </div>
          </motion.a>

          <motion.a
            variants={itemVariants}
            href="https://github.com/R-Mohammed-Hasan"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-4 bg-surface border border-surface-highlight rounded-xl p-4 md:p-5 hover:border-primary-500/30 transition-all duration-300 group cursor-pointer w-full sm:w-auto"
          >
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl md:text-2xl font-bold shadow-lg group-hover:shadow-blue-500/20 transition-all">
              H
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base md:text-lg font-bold text-slate-100 group-hover:text-primary-300 transition-colors">
                  Hasan
                </h3>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                <Github size={14} />
                <span>R-Mohammed-Hasan</span>
              </div>
            </div>
          </motion.a>
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="max-w-6xl mx-auto px-2 md:px-4"
      >
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-surface to-abyss border border-surface-highlight p-6 md:p-10 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary-500/5 via-transparent to-transparent" />
          <div className="relative z-10">
            <h2 className="text-xl md:text-2xl font-bold mb-3 text-slate-100">
              Ready to see the future?
            </h2>
            <p className="text-sm md:text-base text-slate-400 mb-6 max-w-xl mx-auto">
              Built for AI Agents Assemble Hackathon. Try it live or explore the code.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="https://concierge-ai-web.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-xl font-semibold text-sm md:text-base transition-all shadow-[0_0_20px_-5px_rgba(45,212,191,0.3)] hover:shadow-[0_0_30px_-5px_rgba(45,212,191,0.5)]"
              >
                <Rocket size={18} />
                Try Live Demo
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="https://github.com/beetz12/concierge-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-surface-highlight hover:bg-surface-elevated text-slate-100 px-6 py-3 rounded-xl font-semibold text-sm md:text-base transition-all border border-surface-highlight hover:border-primary-500/30"
              >
                <Terminal size={18} />
                View on GitHub
              </motion.a>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="bg-surface/40 backdrop-blur-sm border border-surface-highlight p-4 md:p-6 rounded-xl hover:border-primary-500/30 transition-all duration-300 group h-full"
    >
      <div className="bg-surface p-2.5 md:p-3 rounded-lg inline-block mb-3 md:mb-4 shadow-lg group-hover:shadow-primary-500/10 transition-all">
        {icon}
      </div>
      <h3 className="text-base md:text-lg font-bold mb-1.5 md:mb-2 text-slate-100 group-hover:text-primary-300 transition-colors">
        {title}
      </h3>
      <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}

function TechCard({
  name,
  role,
  fallbackIcon,
  url,
  description,
  color,
}: {
  name: string;
  role: string;
  fallbackIcon: React.ReactNode;
  url: string;
  description: string;
  color: string;
}) {
  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ y: -3, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="flex flex-col h-full bg-surface border border-surface-highlight rounded-xl p-3 md:p-4 hover:border-primary-500/30 transition-all duration-300 relative overflow-hidden group cursor-pointer"
    >
      <div
        className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${color} opacity-5 rounded-full blur-2xl -mr-8 -mt-8 group-hover:opacity-10 transition-all`}
      />

      <div className="flex items-center gap-2 md:gap-3 mb-2">
        <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-surface-highlight flex items-center justify-center text-primary-400 group-hover:scale-110 transition-transform">
          {fallbackIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm md:text-base font-bold text-slate-100 truncate">
              {name}
            </h4>
            <ExternalLink className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
          <span className="text-[10px] md:text-xs uppercase tracking-wider text-primary-500 font-semibold">
            {role}
          </span>
        </div>
      </div>

      <p className="text-slate-400 text-xs md:text-sm leading-relaxed line-clamp-2">
        {description}
      </p>
    </motion.a>
  );
}

function UseCaseCard({
  badge,
  badgeIcon,
  badgeColor,
  title,
  description,
  features,
}: {
  badge: string;
  badgeIcon: React.ReactNode;
  badgeColor: "primary" | "blue";
  title: string;
  description: string;
  features: { icon: React.ComponentType<{ className?: string }>; text: string }[];
}) {
  const colorClasses = {
    primary: {
      badge: "bg-primary-500/10 border-primary-500/20 text-primary-400",
      glow: "bg-primary-500/5 group-hover:bg-primary-500/10",
      icon: "text-primary-500",
    },
    blue: {
      badge: "bg-blue-500/10 border-blue-500/20 text-blue-400",
      glow: "bg-blue-500/5 group-hover:bg-blue-500/10",
      icon: "text-blue-500",
    },
  };

  const colors = colorClasses[badgeColor];

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="bg-gradient-to-br from-surface to-surface-elevated border border-surface-highlight rounded-xl p-4 md:p-6 relative overflow-hidden group h-full"
    >
      <div
        className={`absolute top-0 right-0 w-24 h-24 ${colors.glow} rounded-full blur-3xl transition-all`}
      />
      <div className="relative z-10">
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${colors.badge} border text-xs font-medium mb-3`}
        >
          {badgeIcon}
          {badge}
        </div>
        <h3 className="text-base md:text-lg font-bold text-slate-100 mb-2">
          {title}
        </h3>
        <p className="text-slate-400 text-xs md:text-sm mb-3 md:mb-4">
          {description}
        </p>
        <ul className="space-y-1.5 md:space-y-2">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2 text-xs md:text-sm text-slate-400">
              <feature.icon className={`w-3.5 h-3.5 ${colors.icon} shrink-0`} />
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
