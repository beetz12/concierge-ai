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

## Tools

### CLINE CLI

CLINE CLI is an AI-powered coding assistant that helps with code generation, refactoring, debugging, and project tasks directly from the command line or your IDE.

#### Installation

Install CLINE CLI globally using npm:

```bash
npm install -g @cline/cli
```

**System Requirements:**
- Node.js 18 or higher
- npm or pnpm

#### Basic Usage

**Starting CLINE:**
```bash
# In your project directory
cline
```

**Common Commands:**
- Ask CLINE to perform tasks naturally, e.g.:
  - "Create a new API endpoint for user authentication"
  - "Fix the TypeScript errors in the components directory"
  - "Add tests for the gemini service"
  - "Refactor the database queries to use transactions"

**Interactive Mode:**
- CLINE will analyze your project structure and context
- Provide clear instructions for what you want to accomplish
- Review and approve CLINE's proposed changes before they're applied
- CLINE can execute commands, read/write files, and navigate your codebase

**Exiting CLINE:**
- Type `exit` or press `Ctrl+C` to stop the CLI session

#### Quick Tips

- **Be specific**: The more context you provide, the better CLINE can assist
- **Review changes**: Always review proposed changes before approving them
- **Use for repetitive tasks**: CLINE excels at boilerplate generation and refactoring
- **Iterative approach**: Start with small tasks and build up to larger features

For more information, visit the [CLINE documentation](https://docs.cline.bot).

## Kestra Workflow Setup (Local)

Kestra is used to orchestrate the AI research agent workflows. This section covers local setup with PostgreSQL.

### Prerequisites

- Docker and Docker Compose installed
- PostgreSQL running locally on port 5432 (or use the project's Supabase instance)

### 1. Configure Environment Variables

Ensure your root `.env` file has the Kestra database configuration:

```bash
# Kestra Database Configuration
KESTRA_DB_HOST=host.docker.internal   # Use 'localhost' if not using Docker
KESTRA_DB_PORT=5432
KESTRA_DB_USER=postgres
KESTRA_DB_PASSWORD=postgres
KESTRA_DB_NAME=postgres

# API Keys (used by Kestra flows)
GEMINI_API_KEY=your_gemini_api_key
```

### 2. Create the Kestra Schema

Before starting Kestra, create the dedicated schema in PostgreSQL:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -c "CREATE SCHEMA IF NOT EXISTS kestra;"
```

### 3. Start Kestra

```bash
docker compose up -d
```

This starts:
- **Kestra Server**: [http://localhost:8082](http://localhost:8082)
- **Management API**: Port 8081 (internal)

### 4. Initial Setup (First Time Only)

On first launch, Kestra requires account creation:

1. Open [http://localhost:8082](http://localhost:8082) in your browser
2. Complete the setup wizard:
   - **Email**: `admin@kestra.local` (or your preferred email)
   - **Password**: Must be 8+ characters with 1 uppercase and 1 number (e.g., `Admin123456`)
3. Click through the configuration validation
4. Login with your new credentials

### 5. Register Flows

Flows are stored in `kestra/flows/`. Register them via API:

```bash
# Register the research_providers flow
curl -u "admin@kestra.local:Admin123456" -X POST "http://localhost:8082/api/v1/flows" \
  -H "Content-Type: application/x-yaml" \
  --data-binary @kestra/flows/research_agent.yaml
```

### 6. Trigger a Test Flow

```bash
curl -u "admin@kestra.local:Admin123456" -X POST \
  "http://localhost:8082/api/v1/executions/ai_concierge/research_providers" \
  -H "Content-Type: multipart/form-data" \
  -F "service=plumber" \
  -F "location=Greenville, SC"
```

### Kestra Configuration Reference

The `docker-compose.yml` contains critical Kestra settings:

```yaml
kestra:
  image: kestra/kestra:v1.1.6
  command: server standalone          # Use 'standalone' for PostgreSQL, NOT 'server local'
  environment:
    KESTRA_CONFIGURATION: |
      kestra:
        server:
          basic-auth:
            username: admin@kestra.local
            password: Admin123456     # 8+ chars, 1 upper, 1 number required
        repository:
          type: postgres
        queue:
          type: postgres
      datasources:
        postgres:                     # MUST be 'postgres', not 'default'
          url: jdbc:postgresql://${KESTRA_DB_HOST}:${KESTRA_DB_PORT}/${KESTRA_DB_NAME}?currentSchema=kestra
          driverClassName: org.postgresql.Driver
          username: ${KESTRA_DB_USER}
          password: ${KESTRA_DB_PASSWORD}
```

### Troubleshooting

#### "relation 'settings' does not exist"
**Cause**: Database migrations didn't run properly.
**Fix**:
1. Ensure `datasources.postgres` (not `datasources.default`) is configured
2. Use `server standalone` command (not `server local`)
3. Wipe schema and restart: `DROP SCHEMA kestra CASCADE; CREATE SCHEMA kestra;`

#### 401 Unauthorized on API calls
**Cause**: Basic auth credentials not set up or wrong format.
**Fix**:
1. Complete the setup wizard at http://localhost:8082/ui/setup
2. Password must meet requirements: 8+ chars, 1 uppercase, 1 number
3. Use the credentials you created during setup

#### "Multiple possible bean candidates found: [DSLContext, DSLContext]"
**Cause**: Using `server local` which creates both H2 and PostgreSQL connections.
**Fix**: Change to `command: server standalone` in docker-compose.yml

#### Flow task type errors
**Cause**: Wrong plugin namespace for AI tasks.
**Fix**: Use `io.kestra.plugin.ai.agent.AIAgent` (not `io.kestra.plugin.aiagent.AIAgent`)

### Lessons Learned

| Issue | Wrong | Correct |
|-------|-------|---------|
| Datasource name | `datasources.default` | `datasources.postgres` |
| Server command | `server local` | `server standalone` |
| AIAgent task type | `io.kestra.plugin.aiagent.AIAgent` | `io.kestra.plugin.ai.agent.AIAgent` |
| Password format | `admin` | `Admin123456` (8+ chars, 1 upper, 1 number) |
| Flyway env vars | Manual configuration | Not needed (auto-handled) |

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



## Resources
https://www.youtube.com/watch?v=uFXUniSm7HM - how to build your Own AI Code Review Bot with Cline CLI

https://www.youtube.com/watch?v=hkAp42HBNXw - How to automate workflows with Kestra