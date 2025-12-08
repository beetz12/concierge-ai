**Kestra cannot run on Vercel/Railway** (it's not serverless-friendly). You have **3 production options**, ranked by hackathon practicality:

## 🥇 **Option 1: Kestra Cloud (Recommended - 5 Minutes Setup)**

**Free tier available** - perfect for hackathons and demos.

```bash
# Sign up: https://cloud.kestra.io
# Create namespace: ai_concierge
# Get API token from Settings → API Tokens
```

**Update your Next.js API:**
```typescript
// app/api/trigger-concierge/route.ts
const KESTRA_URL = "https://cloud.kestra.io";  // Production URL
const KESTRA_TOKEN = process.env.KESTRA_CLOUD_TOKEN;

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  const response = await fetch(`${KESTRA_URL}/api/v1/executions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KESTRA_TOKEN}`,
      'Content-Type': 'application/yaml'
    },
    body: yaml.dump({
      namespace: 'ai_concierge',
      flowId: 'concierge_complete',
      inputs: body
    })
  });
  
  return Response.json(await response.json());
}
```

**✅ Hackathon Advantages:**
- No DevOps (zero setup)
- Always available (99.9% uptime)
- Webhooks work out-of-box
- Execution history persists
- Scales automatically
- **Demo-ready immediately**

## 🥈 **Option 2: Self-Hosted Railway (Medium Effort)**

Railway supports Docker deployments perfectly.

**railway.toml**
```toml
[build]
  builder = "NIXPACKS"

[deploy]
  startCommand = "kestra server standalone"
  restartPolicyType = "ON_FAILURE"
  restartPolicyMaxRetries = 10

[env]
  KESTRA_CONFIGURATION = """
  kestra:
    storage:
      type: local
    jdbc:
      url: "jdbc:postgresql://postgres.railway.internal:5432/kestra"
  """
```

**Deploy:**
```bash
railway add
railway up
# Get service URL: https://your-kestra-app.up.railway.app
# API endpoint: https://your-kestra-app.up.railway.app/api/v1/executions
```

**✅ Advantages:**
- Full control
- Private (not public cloud)
- Railway Postgres for persistence
- Scales to multiple workers

**❌ Hackathon Risk:**
- 15-30 min setup time
- Potential Docker issues

## 🥉 **Option 3: Direct API Calls (Skip Kestra - Risky)**

**⚠️ LOSES Wakanda Data Award ($4k)** - Not recommended.

```typescript
// WITHOUT Kestra (loses prize eligibility)
export async function researchProviders(service: string, location: string) {
  // Manual Google search → Gemini analysis → provider list
  const providers = await gemini.analyze(`Find ${service} in ${location}`);
  return providers;
}
```

## 🎯 **Hackathon Winner Strategy: KESTRA CLOUD**

```
Development:      Local Docker (localhost:8080)
Hackathon Demo:   Kestra Cloud (cloud.kestra.io)
Production:       Railway (if needed post-hackathon)
```

**Environment Variables (.env.local)**
```bash
# Development
KESTRA_URL=http://localhost:8081
KESTRA_TOKEN=demo

# Production (Vercel)
KESTRA_URL=https://cloud.kestra.io
KESTRA_CLOUD_TOKEN=your_cloud_token_here
```

**Vercel Deployment (Zero Changes)**
```json
// vercel.json
{
  "env": {
    "KESTRA_URL": "@kestra-url",
    "KESTRA_TOKEN": "@kestra-token"
  }
}
```

## 📋 **Complete Deployment Flow (15 Minutes)**

```
1. Sign up Kestra Cloud → Get API token [2 min]
2. Upload workflows via UI or API [3 min]
   curl -X POST https://cloud.kestra.io/api/v1/namespaces/ai_concierge/flows \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/yaml" \
     --data-binary @concierge-complete.yaml

3. Update Next.js env vars [1 min]
4. Deploy to Vercel [1 min]
5. Test end-to-end [5 min]
6. Demo video [2 min]
```

## 🔍 **Verify Kestra Cloud Works**

**Test workflow trigger:**
```bash
curl -X POST https://cloud.kestra.io/api/v1/executions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/yaml" \
  --data '---
  namespace: ai_concierge
  flowId: concierge_complete
  inputs:
    service: plumber
    location: "Greenville, SC"'
```

**Monitor executions:**
```
https://cloud.kestra.io → ai_concierge → Executions
```

## 🏆 **Demo-Ready Checklist**

| Step | Status | Time |
|------|--------|------|
| Kestra Cloud account | ☐ | 2 min |
| Workflow uploaded | ☐ | 3 min |
| Vercel env vars set | ☐ | 1 min |
| End-to-end test | ☐ | 5 min |
| **Live demo URL** | ☐ | ✅ |

**Kestra Cloud is production-ready today.** No Docker, no servers, no DevOps—just pure hackathon focus on building features. Your Vercel frontend calls Kestra Cloud APIs directly. Webhooks stream live updates to your Socket.io dashboard.

**This preserves ALL prize eligibility** while being demo-proof. 🚀

Need me to walk through the Kestra Cloud signup or create your first workflow YAML?