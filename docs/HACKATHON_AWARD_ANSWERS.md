# Hackathon Award Submission Answers

## The Infinity Build Award – $5,000 (Cline CLI)

**Answer:**
We built a comprehensive suite of 5 automation tools ON TOP of the Cline CLI to revolutionize our development workflow. Instead of using Cline manually, we wrote shell scripts that pipe context and instructions directly into `cline -y` (YOLO mode), effectively turning Cline into a programmable engine for code quality and security.

Our toolkit includes:
1.  **`pnpm cline:security`**: A pre-commit gatekeeper that pipes `git diff` to Cline, instructing it to scan for hardcoded keys, SQL injection (Supabase), and XSS. It automatically blocks commits if vulnerabilities are found.
2.  **`pnpm cline:workflow`**: Automatically validates Kestra YAML flow definitions, checking for syntax errors and logic gaps before they hit the orchestration engine.
3.  **`pnpm cline:review`**: A comprehensive code review tool that analyzes PRs against our specific Next.js 16 + Fastify architecture.
4.  **`pnpm cline:adapter`**: Generates full TypeScript API clients from documentation in under 60 seconds.
5.  **`pnpm cline:test`**: Automatically writes unit tests for new code changes.

These aren't just wrappers; they are production-ready tools integrated into our `.husky/pre-commit` hooks, ensuring every line of code is AI-vetted by Cline before it enters the repo.

**Relevant Links:**
- [Cline Integration Plan](https://github.com/beetz12/concierge-ai/blob/main/docs/FEATURE_CLINE_CLI_INTEGRATION_PLAN.md)
- [Security Review Script](https://github.com/beetz12/concierge-ai/blob/main/scripts/cline/security-review.sh)

---

## The Wakanda Data Award – $4,000 (Kestra)

**Answer:**
We utilized Kestra's **AI Agent** (`io.kestra.plugin.ai.agent.AIAgent`) as the "brain" of our service broker. The challenge was to take unstructured, messy data from the real world—10+ raw Google Maps results and imperfect voice transcripts from successful phone calls—and turn them into a single, confident recommendation.

Our Kestra implementation:
1.  **Summarizes Data**: The `research_agent` flow aggregates 10+ provider profiles (ratings, reviews, location) and combines them with structured data extracted from VAPI voice calls (availability, rates, tech qualifications).
2.  **Makes Decisions**: The AI Agent doesn't just pass data along; it actively **decides** who to recommend. It filters out providers who were "disqualified" during the phone interview (e.g., unavailable or unlicensed), scores the remaining candidates based on a weighted matrix (30% urgency, 20% price, 50% quality), and selects the **Top 3**.
3.  **Explains Its Reasoning**: The Agent generates a natural-language explanation for *why* it chose those specific three (e.g., "Best availability with a competitive rate"), which is displayed directly to the user.

**Relevant Links:**
- [Research Agent Workflow](https://github.com/beetz12/concierge-ai/blob/main/kestra/flows/research_agent.yaml)
- [Recommendation Workflow](https://github.com/beetz12/concierge-ai/blob/main/kestra/flows/recommend_providers.yaml)

---

## The Stormbreaker Deployment Award – $2,000 (Vercel)

**Answer:**
ConciergeAI is live and fully deployed on Vercel. Our Next.js 16 frontend leverages Vercel's edge network for lightning-fast delivery of our real-time dashboard. The deployment integrates seamlessly with our backend APIs and Supabase infrastructure, ensuring that when the AI places a phone call, the user sees the status update on their screen instantly, no matter where they are in the world.

**Relevant Links:**
- [Live Deployment](https://concierge-ai-web.vercel.app/)
- [GitHub Repository](https://github.com/beetz12/concierge-ai)

---

## The Captain Code Award – $1,000 (CodeRabbit)

**Answer:**
We moved fast during this hackathon—shipping a full monorepo with 3 integrated AI services in 3 days—but we refused to sacrifice quality. **CodeRabbit** acted as our dedicated QA engineer, reviewing every single Pull Request.

CodeRabbit was instrumental in:
1.  **Security**: It caught a hardcoded VAPI API key in an early PR before it could be merged (we moved it to `.env` immediately).
2.  **Quality**: It suggested a `useMemo` optimization for our provider filtering logic that improved React render performance.
3.  **Documentation**: It automatically generated high-quality summaries of our changes, keeping our changelogs clean.

We configured a custom `.coderabbit.yaml` to enforce specific rules for our Next.js and Fastify stack, ensuring the AI knew exactly what "good code" looked like for us.

**Relevant Links:**
- [Pull Request with CodeRabbit Reviews](https://github.com/beetz12/concierge-ai/pulls?q=is%3Apr+is%3Aclosed)
- [CodeRabbit Configuration](https://github.com/beetz12/concierge-ai/blob/main/.coderabbit.yaml)
