"use client";

import { useState, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "motion/react";
import {
  GitBranch,
  Workflow,
  Brain,
  Rocket,
  Code,
  ShieldCheck,
  type LucideIcon,
  Maximize2,
  Minimize2,
} from "lucide-react";

// Type definitions
interface InfraStepDetails {
  title: string;
  description: string;
  features: string[];
  role: string;
  url: string;
  color: string;
}

interface InfraStepData {
  id: string;
  title: string;
  shortDesc: string;
  icon: LucideIcon;
  details: InfraStepDetails;
}

interface InfraNodeData extends InfraStepData {
  stepNumber: number;
  [key: string]: unknown;
}

// Infrastructure step data
const infraStepsData: InfraStepData[] = [
  {
    id: "1",
    title: "Code",
    shortDesc: "Development starts here",
    icon: Code,
    details: {
      title: "Write Code",
      description:
        "Modern monorepo architecture with TypeScript, Next.js 16, and Fastify 5. Shared packages ensure consistency across frontend and backend.",
      features: [
        "Turborepo for blazing-fast builds",
        "pnpm workspaces for efficient dependencies",
        "TypeScript 5.9 for type safety",
        "ESLint & Prettier for code quality",
      ],
      role: "Development Environment",
      url: "https://github.com/beetz12/concierge-ai",
      color: "from-slate-400 to-slate-600",
    },
  },
  {
    id: "2",
    title: "CodeRabbit",
    shortDesc: "AI code reviews",
    icon: ShieldCheck,
    details: {
      title: "AI-Powered Code Review",
      description:
        "CodeRabbit automatically reviews every pull request, providing intelligent feedback on code quality, security, and best practices.",
      features: [
        "Automated PR reviews on every commit",
        "Security vulnerability detection",
        "Code quality & best practice suggestions",
        "Documentation completeness checks",
      ],
      role: "Code Quality Guardian",
      url: "https://coderabbit.ai",
      color: "from-orange-500 to-amber-500",
    },
  },
  {
    id: "3",
    title: "GitHub",
    shortDesc: "Version control & CI/CD",
    icon: GitBranch,
    details: {
      title: "GitHub Workflows",
      description:
        "GitHub Actions automate testing, type checking, and deployment workflows. Every push triggers comprehensive quality checks.",
      features: [
        "Automated CI/CD pipelines",
        "Type checking & linting on every PR",
        "Integration with CodeRabbit for reviews",
        "Branch protection & security scanning",
      ],
      role: "CI/CD Orchestration",
      url: "https://github.com",
      color: "from-slate-700 to-slate-900",
    },
  },
  {
    id: "4",
    title: "Kestra",
    shortDesc: "Workflow orchestration",
    icon: Workflow,
    details: {
      title: "Workflow Orchestration",
      description:
        "Kestra orchestrates complex AI workflows - from provider research to concurrent VAPI calls. Makes intelligent decisions based on real-time system feedback.",
      features: [
        "Visual workflow designer for complex flows",
        "Concurrent task execution (up to 5 calls)",
        "Real-time monitoring & decision-making",
        "Error handling & retry logic",
      ],
      role: "Workflow Engine",
      url: "https://kestra.io",
      color: "from-purple-500 to-violet-600",
    },
  },
  {
    id: "5",
    title: "Gemini AI",
    shortDesc: "Intelligence layer",
    icon: Brain,
    details: {
      title: "AI Intelligence",
      description:
        "Google Gemini 2.5 Flash powers provider research with Maps grounding, analyzes call results, and generates intelligent recommendations with structured output.",
      features: [
        "Google Maps grounding for local search",
        "Structured output with typed schemas",
        "Multi-step reasoning & analysis",
        "Context-aware decision making",
      ],
      role: "AI Brain",
      url: "https://ai.google.dev",
      color: "from-blue-400 to-indigo-500",
    },
  },
  {
    id: "6",
    title: "Vercel",
    shortDesc: "Global deployment",
    icon: Rocket,
    details: {
      title: "Deploy to Production",
      description:
        "Vercel provides instant global deployment with automatic previews for every PR. Zero-config deployment with edge caching and serverless functions.",
      features: [
        "Automatic deployments from main branch",
        "Preview URLs for every pull request",
        "Global CDN with edge caching",
        "Zero-downtime deployments",
      ],
      role: "Deployment Platform",
      url: "https://vercel.com",
      color: "from-gray-400 to-gray-600",
    },
  },
];

// Custom Node Component
function InfraStepNode({ data }: NodeProps<Node<InfraNodeData>>) {
  const [isHovered, setIsHovered] = useState(false);
  const nodeData = data as InfraNodeData;
  const Icon = nodeData.icon;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary-500 !w-2 !h-2 !border-2 !border-surface"
      />

      <motion.div
        className="relative cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {/* Main Node */}
        <div className="bg-surface border-2 border-surface-highlight rounded-2xl p-4 w-[140px] md:w-[160px] transition-all duration-300 hover:border-primary-500/50 hover:shadow-lg hover:shadow-primary-500/20">
          {/* Step Number Badge */}
          <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-primary-950 text-xs font-bold flex items-center justify-center shadow-lg shadow-primary-500/30 z-10">
            {nodeData.stepNumber}
          </div>

          {/* Icon */}
          <div className="w-12 h-12 mx-auto rounded-xl bg-surface-highlight flex items-center justify-center text-primary-400 mb-3">
            <Icon className="w-6 h-6" />
          </div>

          {/* Title */}
          <h3 className="font-semibold text-sm text-slate-100 text-center mb-1">
            {nodeData.title}
          </h3>
          <p className="text-xs text-slate-500 text-center">{nodeData.shortDesc}</p>
        </div>

        {/* Hover Detail Popup */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-3 w-[280px] md:w-[320px] bg-surface-elevated border border-surface-highlight rounded-xl p-4 shadow-2xl shadow-black/50"
            >
              {/* Arrow */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-surface-elevated border-l border-t border-surface-highlight rotate-45" />

              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${nodeData.details.color} opacity-20 flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100">
                      {nodeData.details.title}
                    </h4>
                    <span className="text-xs text-primary-400">
                      {nodeData.details.role}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-slate-400 mb-3 leading-relaxed">
                  {nodeData.details.description}
                </p>

                <div className="space-y-1.5 mb-3">
                  {nodeData.details.features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                      <span className="text-slate-300">{feature}</span>
                    </div>
                  ))}
                </div>

                <a
                  href={nodeData.details.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Learn more →
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary-500 !w-2 !h-2 !border-2 !border-surface"
      />
    </>
  );
}

const nodeTypes = {
  infraStep: InfraStepNode,
};

// Calculate node positions
function getNodePositions(isMobile: boolean): { x: number; y: number }[] {
  if (isMobile) {
    // Vertical layout for mobile
    return [
      { x: 100, y: 0 },
      { x: 100, y: 180 },
      { x: 100, y: 360 },
      { x: 100, y: 540 },
      { x: 100, y: 720 },
      { x: 100, y: 900 },
    ];
  }
  // Horizontal zigzag layout for desktop
  return [
    { x: 0, y: 100 },
    { x: 250, y: 0 },
    { x: 500, y: 100 },
    { x: 750, y: 0 },
    { x: 1000, y: 100 },
    { x: 1250, y: 0 },
  ];
}

export function InfrastructureCanvas() {
  const [isMobile, setIsMobile] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    // Prevent body scroll when maximized
    if (isMaximized) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMaximized]);

  const positions = getNodePositions(isMobile);

  const initialNodes: Node<InfraNodeData>[] = infraStepsData.map((step, index) => ({
    id: step.id,
    type: "infraStep",
    position: positions[index] ?? { x: 0, y: index * 180 },
    data: {
      ...step,
      stepNumber: index + 1,
    } as InfraNodeData,
  }));

  const initialEdges: Edge[] = [
    {
      id: "e1-2",
      source: "1",
      target: "2",
      animated: true,
      style: { stroke: "#14B8A6", strokeWidth: 2 },
    },
    {
      id: "e2-3",
      source: "2",
      target: "3",
      animated: true,
      style: { stroke: "#14B8A6", strokeWidth: 2 },
    },
    {
      id: "e3-4",
      source: "3",
      target: "4",
      animated: true,
      style: { stroke: "#14B8A6", strokeWidth: 2 },
    },
    {
      id: "e4-5",
      source: "4",
      target: "5",
      animated: true,
      style: { stroke: "#14B8A6", strokeWidth: 2 },
    },
    {
      id: "e5-6",
      source: "5",
      target: "6",
      animated: true,
      style: { stroke: "#14B8A6", strokeWidth: 2 },
    },
  ];

  const [nodes] = useNodesState(initialNodes);
  const [edges] = useEdgesState(initialEdges);

  const toggleMaximize = () => setIsMaximized(!isMaximized);

  return (
    <>
      {/* Maximized Overlay */}
      <AnimatePresence>
        {isMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-abyss/95 backdrop-blur-sm"
            onClick={toggleMaximize}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full h-full p-4 md:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full h-full bg-abyss rounded-2xl border border-surface-highlight overflow-hidden relative shadow-2xl">
                {/* Instructions Overlay */}
                <div className="absolute top-3 left-3 z-10 bg-surface/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-surface-highlight">
                  <p className="text-xs text-slate-400">
                    <span className="text-primary-400 font-medium">Tip:</span> Drag to pan
                    | Scroll to zoom | Hover for details
                  </p>
                </div>

                {/* Minimize Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleMaximize}
                  className="absolute top-3 right-3 z-10 bg-surface/80 backdrop-blur-sm hover:bg-surface-hover rounded-lg px-3 py-2 border border-surface-highlight transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Minimize2 className="w-4 h-4 text-slate-400 group-hover:text-primary-400 transition-colors" />
                    <span className="text-xs text-slate-400 group-hover:text-slate-100 transition-colors">
                      Exit Fullscreen
                    </span>
                  </div>
                </motion.button>

                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  minZoom={0.5}
                  maxZoom={2}
                  attributionPosition="bottom-left"
                  proOptions={{ hideAttribution: true }}
                  className="bg-transparent"
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1}
                    color="#1A2A3E"
                  />
                  <Controls
                    className="!bg-surface !border-surface-highlight !rounded-lg overflow-hidden [&>button]:!bg-surface [&>button]:!border-surface-highlight [&>button]:!text-slate-400 [&>button:hover]:!bg-surface-hover [&>button:hover]:!text-slate-100"
                    showInteractive={false}
                  />
                </ReactFlow>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Normal View */}
      <div className="w-full h-[500px] md:h-[400px] bg-abyss rounded-2xl border border-surface-highlight overflow-hidden relative">
        {/* Instructions Overlay */}
        <div className="absolute top-3 left-3 z-10 bg-surface/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-surface-highlight">
          <p className="text-xs text-slate-400">
            <span className="text-primary-400 font-medium">Tip:</span> Drag to pan
            | Scroll to zoom | Hover for details
          </p>
        </div>

        {/* Maximize Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleMaximize}
          className="absolute top-3 right-3 z-10 bg-surface/80 backdrop-blur-sm hover:bg-surface-hover rounded-lg px-3 py-2 border border-surface-highlight transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Maximize2 className="w-4 h-4 text-slate-400 group-hover:text-primary-400 transition-colors" />
            <span className="text-xs text-slate-400 group-hover:text-slate-100 transition-colors hidden md:inline">
              Fullscreen
            </span>
          </div>
        </motion.button>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.5}
          maxZoom={2}
          attributionPosition="bottom-left"
          proOptions={{ hideAttribution: true }}
          className="bg-transparent"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#1A2A3E"
          />
          <Controls
            className="!bg-surface !border-surface-highlight !rounded-lg overflow-hidden [&>button]:!bg-surface [&>button]:!border-surface-highlight [&>button]:!text-slate-400 [&>button:hover]:!bg-surface-hover [&>button:hover]:!text-slate-100"
            showInteractive={false}
          />
        </ReactFlow>
      </div>
    </>
  );
}
