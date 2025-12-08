import { Metadata } from 'next';
import {
    Terminal,
    Workflow,
    Brain,
    Globe,
    ShieldCheck,
    Zap,
    Cpu,
    Rocket
} from 'lucide-react';

export const metadata: Metadata = {
    title: 'About | ConciergeAI',
    description: 'The narrative behind ConciergeAI and the AI Agents Assemble Hackathon.',
};

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-abyss text-slate-100 selection:bg-primary-500/30">
            {/* Hero Section */}
            <div className="relative overflow-hidden w-full py-20 lg:py-32 px-6">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-primary-500/10 blur-[120px] rounded-full pointer-events-none" />

                <div className="max-w-5xl mx-auto text-center relative z-10 animate-fadeIn">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-highlight border border-primary-500/20 text-primary-400 text-sm font-medium mb-8 shadow-[0_0_15px_-3px_rgba(45,212,191,0.2)]">
                        <Zap size={14} className="fill-primary-400" />
                        <span>Built for AI Agents Assemble</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
                        <span className="block text-slate-100 mb-2">Unleashing the</span>
                        <span className="bg-gradient-to-r from-primary-300 via-primary-400 to-primary-600 bg-clip-text text-transparent drop-shadow-sm">
                            Next Gen of Agents
                        </span>
                    </h1>

                    <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
                        ConciergeAI isn't just an app. It's a workforce.
                        Designed to <span className="text-primary-300 font-semibold">think</span>,
                        <span className="text-primary-300 font-semibold"> automate</span>,
                        <span className="text-primary-300 font-semibold"> orchestrate</span>, and
                        <span className="text-primary-300 font-semibold"> evolve</span>.
                    </p>
                </div>
            </div>

            {/* The Mission Grid */}
            <div className="max-w-7xl mx-auto px-6 pb-24">
                <div className="grid md:grid-cols-3 gap-8 mb-20">
                    <Card
                        icon={<Cpu className="text-primary-400" size={32} />}
                        title="Beyond Prompts"
                        description="We moved past simple text generation to build agents that understand context, negotiate outcomes, and take decisive action in the real world."
                    />
                    <Card
                        icon={<Workflow className="text-primary-400" size={32} />}
                        title="Autonomous Workflow"
                        description="From intake to resolution, ConciergeAI handles complex multi-step processes without human intervention, orchestrated purely by intelligence."
                    />
                    <Card
                        icon={<Rocket className="text-primary-400" size={32} />}
                        title="Evolutionary Design"
                        description="Built on an architecture that learns. Every interaction refines the model, making the assistant smarter and more capable with every request."
                    />
                </div>

                {/* The Tech Stack / Infinity Stones */}
                <div className="mb-24">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            Assemble Your Tools
                        </h2>
                        <p className="text-slate-400 max-w-2xl mx-auto">
                            Powered by the "Infinity Stones" of the modern AI stack.
                            Each technology provides a critical pillar of our agentic architecture.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <TechCard
                            name="Cline"
                            role="The Architect"
                            icon={<Terminal size={24} />}
                            description="Used to build capabilities and automation tools directly through the CLI, accelerating our development velocity."
                        />
                        <TechCard
                            name="Kestra"
                            role="The Orchestrator"
                            icon={<Workflow size={24} />}
                            description="The nervous system of our data. Summarizing impacts and making critical decisions based on real-time system feedback."
                        />
                        <TechCard
                            name="Oumi"
                            role="The Brain"
                            icon={<Brain size={24} />}
                            description="Leveraging Reinforcement Learning and fine-tuning to synthesize data and judge outcomes with human-like precision."
                        />
                        <TechCard
                            name="Vercel"
                            role="The Stage"
                            icon={<Globe size={24} />}
                            description="Instant global deployment. Ensuring our agents are live, accessible, and responsive anywhere in the world."
                        />
                        <TechCard
                            name="CodeRabbit"
                            role="The Guardian"
                            icon={<ShieldCheck size={24} />}
                            description="Continuous code quality improvement. Ensuring our codebase remains clean, documented, and robust as we scale."
                        />
                    </div>
                </div>

                {/* Call to Action / Footer */}
                <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-surface to-abyss border border-surface-highlight p-12 text-center">
                    <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
                    <div className="relative z-10">
                        <h2 className="text-3xl font-bold mb-6 text-slate-100">
                            Ready to see the future?
                        </h2>
                        <p className="text-slate-400 mb-8 max-w-2xl mx-auto">
                            This project was built for the AI Agents Assemble Hackathon.
                            Explore the code, verify the agents, and witness the next evolution of AI.
                        </p>
                        <a
                            href="https://github.com/beetz12/concierge-ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-8 py-4 rounded-xl font-semibold transition-all shadow-[0_0_20px_-5px_rgba(45,212,191,0.3)] hover:shadow-[0_0_30px_-5px_rgba(45,212,191,0.5)]"
                        >
                            <Terminal size={20} />
                            View on GitHub
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Card({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
    return (
        <div className="bg-surface/40 backdrop-blur-sm border border-surface-highlight p-8 rounded-2xl hover:border-primary-500/30 transition-colors group">
            <div className="bg-surface p-4 rounded-xl inline-block mb-6 shadow-lg group-hover:shadow-primary-500/10 transition-all">
                {icon}
            </div>
            <h3 className="text-xl font-bold mb-3 text-slate-100 group-hover:text-primary-300 transition-colors">{title}</h3>
            <p className="text-slate-400 leading-relaxed">
                {description}
            </p>
        </div>
    );
}

function TechCard({ name, role, icon, description }: { name: string, role: string, icon: React.ReactNode, description: string }) {
    return (
        <div className="flex flex-col h-full bg-surface border border-surface-highlight rounded-xl p-6 hover:bg-surface-hover transition-colors relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-primary-500/10 transition-all" />

            <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-lg bg-surface-highlight flex items-center justify-center text-primary-400 group-hover:scale-110 transition-transform">
                    {icon}
                </div>
                <div>
                    <h4 className="text-lg font-bold text-slate-100">{name}</h4>
                    <span className="text-xs uppercase tracking-wider text-primary-500 font-semibold">{role}</span>
                </div>
            </div>

            <p className="text-slate-400 text-sm leading-relaxed">
                {description}
            </p>
        </div>
    );
}
