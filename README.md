# AI Concierge

An AI-powered receptionist and secretary designed to help you research local service providers and book appointments effortlessly.

## Live Deployment

- **Production Web App**: [https://concierge-ai-web.vercel.app/](https://concierge-ai-web.vercel.app/)
- **Production API**: [https://api-production-8fe4.up.railway.app](https://api-production-8fe4.up.railway.app)
- **API Documentation**: [https://api-production-8fe4.up.railway.app/docs](https://api-production-8fe4.up.railway.app/docs)

## API Documentation

Interactive API documentation is available via Swagger UI:

- **Production**: [https://api-production-8fe4.up.railway.app/docs](https://api-production-8fe4.up.railway.app/docs)
- **Local Development**: [http://localhost:8000/docs](http://localhost:8000/docs)

The documentation includes all available endpoints with request/response schemas, allowing you to test API calls directly from the browser.

## About

The AI Concierge acts as your personal assistant for managing real-world tasks. Simply submit a request like:

> "I have a leaking toilet that I need fixed ASAP. I'm in Greenville SC, and I want a reputable licensed local plumber with at least 4.7 rating and can arrive in the next 2 days."

The application will:
1.  **Search** for qualified service providers in your area.
2.  **Call** providers one-by-one to verify rates, availability, and criteria.
3.  **Schedule** the appointment once a suitable provider is found.
4.  **Notify** you via text/email when the task is complete.

It also maintains a history of requests, detailed logs of AI analysis and interactions, and supports direct tasks where you provide specific contact info for the AI to call.

## Tech Stack

This project is a monorepo managed by **Turborepo**.

*   **Frontend**: Next.js (`apps/web`)
*   **Backend**: Fastify (`apps/api`)
*   **Database**: Supabase
*   **AI Integration**: Google Gemini (inferred from `apps/web` dependencies)
*   **Styling**: Tailwind CSS
*   **Package Manager**: pnpm

## Getting Started

### Prerequisites

*   Node.js (>=18)
*   pnpm

### Installation

Install dependencies from the root directory:

```bash
pnpm install
```

### Environment Variables

Ensure you have the necessary environment variables set up. Check `apps/api/.env.example` and `apps/web/.env.local.example` for required configurations (e.g., Supabase credentials, AI API keys).

### Database Setup

Run the Supabase migrations to create the required tables:

#### Option A: Supabase CLI (Recommended)

```bash
# Install Supabase CLI globally
npm install -g supabase

# Login to Supabase (opens browser for authentication)
supabase login

# Verify you're logged in and see your projects
supabase projects list

# Link to your project (from project root)
# Replace YOUR_PROJECT_REF with your project reference ID from the list above
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations to remote database
supabase db push
```

> **Note:** You must run `supabase login` before `supabase link`. The project ref can be found in your Supabase dashboard URL or by running `supabase projects list`.

#### Option B: Manual SQL Execution

1. Go to your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new)
2. Copy the contents of `supabase/migrations/20250101000000_initial_schema.sql`
3. Click **Run**

### Creating New Migrations

```bash
# Create a new migration file
supabase migration new add_new_feature

# This creates: supabase/migrations/YYYYMMDDHHMMSS_add_new_feature.sql
# Edit the file with your SQL, then push:
supabase db push
```

### Useful Supabase CLI Commands

```bash
# View migration status
supabase migration list

# Generate TypeScript types from your schema
supabase gen types typescript --linked > packages/types/database.ts

# Pull remote schema changes (if made via dashboard)
supabase db pull

# Diff local vs remote schema
supabase db diff

# Reset database and re-apply all migrations
supabase db reset --linked
```

## Running the Project

You can run the entire stack (Frontend + Backend) simultaneously from the root directory:

```bash
pnpm dev
```

This command executes `turbo run dev`, which starts:
*   **Web App**: [http://localhost:3000](http://localhost:3000)
*   **API**: [http://localhost:8000](http://localhost:8000)

### Running Individual Apps

To run specific parts of the application:

**Frontend (Web):**
```bash
pnpm --filter web dev
# or
cd apps/web && pnpm dev
```

**Backend (API):**
```bash
pnpm --filter api dev
# or
cd apps/api && pnpm dev
```

## Build

To build all applications:

```bash
pnpm build
```

## Kestra Workflow Setup (Local)

To run the Kestra orchestration engine locally:

### 1. Start Kestra & Postgres
Run the following command from the root directory:

```bash
docker compose up -d
```

This starts:
- **Kestra Server**: [http://localhost:8082](http://localhost:8082)
- **Postgres Database**: `jdbc:postgresql://postgres:5432/kestra`

### 2. Verify Installation
Open [http://localhost:8082](http://localhost:8082) in your browser. You should see the Kestra UI.

### 3. Trigger a Test Flow
You can test the API integration by triggering the research agent:

```bash
curl -X POST http://localhost:8082/api/v1/executions/ai_concierge/research_providers \
  -H "Content-Type: multipart/form-data" \
  -F "service=plumber" \
  -F "location=Greenville, SC"
```

## Contributing

We welcome contributions from all team members! Follow these steps to contribute code via pull requests.

### Step 1: Sync Your Local Main Branch

Before creating a new feature branch, make sure your local `main` branch is up to date:

```bash
git checkout main
git pull origin main
```

### Step 2: Create a Feature Branch

Create a new branch for your feature or fix. Use a descriptive name that reflects what you're working on:

```bash
git checkout -b feature/your-feature-name
```

**Branch naming conventions:**
- `feature/` - for new features (e.g., `feature/add-user-auth`)
- `fix/` - for bug fixes (e.g., `fix/login-button-error`)
- `docs/` - for documentation updates (e.g., `docs/update-readme`)
- `refactor/` - for code refactoring (e.g., `refactor/cleanup-api-routes`)

### Step 3: Make Your Changes

Make your code changes, then stage and commit them with a clear, descriptive message:

```bash
# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "feat: add user authentication flow"
```

**Commit message tips:**
- Keep the first line under 50 characters
- Use present tense ("add feature" not "added feature")
- Be specific about what changed

### Step 4: Push Your Branch to GitHub

Push your feature branch to the remote repository:

```bash
git push origin feature/your-feature-name
```

If this is your first push for this branch, Git will provide a link to create a pull request.

### Step 5: Create a Pull Request

1. Go to the repository on GitHub: [https://github.com/beetz12/concierge-ai](https://github.com/beetz12/concierge-ai)
2. You'll see a banner prompting you to **"Compare & pull request"** – click it
3. Or navigate to the **Pull requests** tab and click **"New pull request"**
4. Select your feature branch to merge into `main`
5. Fill out the PR template:
   - **Title**: Brief description of your changes
   - **Description**: Explain what you changed and why
   - **Link any related issues** if applicable
6. Click **"Create pull request"**

### Step 6: Address Review Feedback

After creating your PR:
- Team members will review your code
- Make any requested changes by committing to the same branch
- Push your updates – the PR will automatically update

```bash
# After making requested changes
git add .
git commit -m "fix: address review feedback"
git push origin feature/your-feature-name
```

### Step 7: Merge and Clean Up

Once your PR is approved and merged:

```bash
# Switch back to main and pull the latest changes
git checkout main
git pull origin main

# Delete your local feature branch (optional but recommended)
git branch -d feature/your-feature-name
```

### Quick Reference Commands

| Action | Command |
|--------|---------|
| Check current branch | `git branch` |
| See all branches | `git branch -a` |
| Switch to a branch | `git checkout branch-name` |
| Check status | `git status` |
| View commit history | `git log --oneline` |
| Discard local changes | `git checkout -- filename` |
| Stash changes temporarily | `git stash` |
| Apply stashed changes | `git stash pop` |

### Need Help?

- Run `git status` to see what's happening in your repo
- Run `git log --oneline -5` to see recent commits
- Ask a team member if you're stuck!

## Troubleshooting

### `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` when running `pnpm install`

If you see an error like:
```
ERR_PNPM_WORKSPACE_PKG_NOT_FOUND In apps/api: "@repo/types@workspace:*" is in the dependencies but no package named "@repo/types" is present in the workspace
```

This means your local repository is missing workspace packages. Fix it by pulling the latest changes:

```bash
git checkout main
git pull origin main
pnpm install
```

If the issue persists, verify that the `packages/` directory contains all required packages:
- `packages/types/`
- `packages/ui/`
- `packages/eslint-config/`
- `packages/typescript-config/`

If any are missing, re-clone the repository or contact a team member.
