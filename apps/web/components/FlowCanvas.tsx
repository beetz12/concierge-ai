"use client";

import { useState, useMemo, useEffect } from "react";
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
  MessageSquare,
  Search,
  Phone,
  Sparkles,
  CheckCircle,
  Calendar,
  Maximize2,
  Minimize2,
  type LucideIcon,
} from "lucide-react";

// Type definitions
interface PoweredBy {
  name: string;
  color: string;
  usage: string;
}

interface FlowStepDetails {
  title: string;
  description: string;
  actions: string[];
  techNote: string;
  poweredBy?: PoweredBy[];
}

interface FlowStepData {
  id: string;
  title: string;
  shortDesc: string;
  icon: LucideIcon;
  details: FlowStepDetails;
}

interface FlowNodeData extends FlowStepData {
  stepNumber: number;
  [key: string]: unknown; // Index signature for React Flow compatibility
}

// Flow step data
const flowStepsData: FlowStepData[] = [
  {
    id: "1",
    title: "Submit Request",
    shortDesc: "User submits service need",
    icon: MessageSquare,
    details: {
      title: "Submit Your Request",
      description:
        "Tell us what you need - whether it's a plumber, electrician, cleaner, or any other service. Provide your location and any specific requirements.",
      actions: [
        "Enter service type (e.g., 'plumber for leak repair')",
        "Provide your address using Google Places autocomplete",
        "Set urgency level and minimum rating preference",
        "Add any special requirements or notes",
      ],
      techNote: "Uses Google Places API for accurate address capture",
      poweredBy: [
        {
          name: "Next.js",
          color: "text-slate-100",
          usage: "Frontend framework with App Router",
        },
        {
          name: "Google Places",
          color: "text-blue-400",
          usage: "Address autocomplete & geocoding",
        },
      ],
    },
  },
  {
    id: "2",
    title: "AI Research",
    shortDesc: "Gemini searches providers",
    icon: Search,
    details: {
      title: "AI-Powered Research",
      description:
        "Google Gemini with Maps grounding searches for the best local providers matching your criteria. It analyzes ratings, reviews, and relevance.",
      actions: [
        "Search local businesses via Google Maps integration",
        "Filter by ratings, reviews, and relevance score",
        "Verify business hours and service availability",
        "Compile top candidates for calling",
      ],
      techNote: "Powered by Gemini 2.5 Flash with Google Maps grounding",
      poweredBy: [
        {
          name: "Google Gemini",
          color: "text-blue-400",
          usage: "AI with Google Maps grounding for local search",
        },
        {
          name: "Kestra",
          color: "text-purple-400",
          usage: "Workflow orchestration & decision-making",
        },
      ],
    },
  },
  {
    id: "3",
    title: "Voice Calls",
    shortDesc: "VAPI calls providers",
    icon: Phone,
    details: {
      title: "Real Phone Calls",
      description:
        "Our AI makes actual phone calls to providers using VAPI's voice AI. It verifies availability, asks about rates, and checks if they can meet your needs.",
      actions: [
        "Concurrent calls to multiple providers (up to 5)",
        "Verify current availability and earliest appointment",
        "Confirm service rates and any additional fees",
        "Check if requirements can be met by one technician",
      ],
      techNote: "Uses VAPI.ai with custom assistant configuration",
      poweredBy: [
        {
          name: "VAPI",
          color: "text-cyan-400",
          usage: "Voice AI for real phone conversations",
        },
        {
          name: "Kestra",
          color: "text-purple-400",
          usage: "Concurrent call orchestration & monitoring",
        },
      ],
    },
  },
  {
    id: "4",
    title: "AI Analysis",
    shortDesc: "Analyzes call results",
    icon: Sparkles,
    details: {
      title: "Intelligent Analysis",
      description:
        "Gemini analyzes all call results, considering availability, pricing, customer service quality, and how well each provider matches your requirements.",
      actions: [
        "Parse call transcripts for key information",
        "Score providers on multiple criteria",
        "Identify any disqualifications or concerns",
        "Generate comparison matrix with reasoning",
      ],
      techNote: "Structured output with typed analysis schema",
      poweredBy: [
        {
          name: "Google Gemini",
          color: "text-blue-400",
          usage: "AI analysis with structured output schema",
        },
        {
          name: "Supabase",
          color: "text-emerald-400",
          usage: "PostgreSQL storage & real-time updates",
        },
      ],
    },
  },
  {
    id: "5",
    title: "Top 3 Picks",
    shortDesc: "Presents best options",
    icon: CheckCircle,
    details: {
      title: "Top 3 Recommendations",
      description:
        "You receive the top 3 providers ranked by AI with detailed reasoning. See why each was selected and compare their offerings side-by-side.",
      actions: [
        "Ranked list with match scores (0-100)",
        "AI reasoning explaining each recommendation",
        "Quick comparison of rates and availability",
        "Highlights of what makes each provider stand out",
      ],
      techNote: "Real-time updates via Supabase subscriptions",
      poweredBy: [
        {
          name: "Google Gemini",
          color: "text-blue-400",
          usage: "AI reasoning & provider ranking",
        },
        {
          name: "Supabase",
          color: "text-emerald-400",
          usage: "Real-time subscriptions for live updates",
        },
      ],
    },
  },
  {
    id: "6",
    title: "Book",
    shortDesc: "Confirm your booking",
    icon: Calendar,
    details: {
      title: "Book Your Appointment",
      description:
        "Select your preferred provider and confirm the booking. The AI can make a follow-up call to finalize the appointment time.",
      actions: [
        "Review provider details and call transcript",
        "Select preferred appointment slot",
        "Confirm booking with one click",
        "Receive confirmation and provider contact info",
      ],
      techNote: "Optional callback to finalize appointment",
      poweredBy: [
        {
          name: "VAPI",
          color: "text-cyan-400",
          usage: "Optional follow-up call for scheduling",
        },
        {
          name: "Supabase",
          color: "text-emerald-400",
          usage: "Booking confirmation & data persistence",
        },
      ],
    },
  },
];

// Custom Node Component
function FlowStepNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const [isHovered, setIsHovered] = useState(false);
  const nodeData = data as FlowNodeData;
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
                  <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100">
                      {nodeData.details.title}
                    </h4>
                    <span className="text-xs text-primary-400">
                      Step {nodeData.stepNumber}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-slate-400 mb-3 leading-relaxed">
                  {nodeData.details.description}
                </p>

                <div className="space-y-1.5 mb-3">
                  {nodeData.details.actions.map((action, index) => (
                    <div key={index} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                      <span className="text-slate-300">{action}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-surface-highlight space-y-2">
                  {nodeData.details.poweredBy && nodeData.details.poweredBy.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1.5">
                        Powered By
                      </div>
                      <div className="space-y-1.5">
                        {nodeData.details.poweredBy.map((tech, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <div className={`w-1 h-1 rounded-full ${tech.color.replace('text-', 'bg-')} mt-1.5 shrink-0`} />
                            <div>
                              <span className={`text-xs font-semibold ${tech.color}`}>
                                {tech.name}
                              </span>
                              <span className="text-xs text-slate-500"> - {tech.usage}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <span className="text-xs text-slate-500 italic block">
                    {nodeData.details.techNote}
                  </span>
                </div>
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
  flowStep: FlowStepNode,
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

export function FlowCanvas() {
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

  const initialNodes: Node<FlowNodeData>[] = flowStepsData.map((step, index) => ({
    id: step.id,
    type: "flowStep",
    position: positions[index] ?? { x: 0, y: index * 180 },
    data: {
      ...step,
      stepNumber: index + 1,
    } as FlowNodeData,
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
