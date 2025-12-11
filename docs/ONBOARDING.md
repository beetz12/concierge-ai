**Welcome to the Team! Here's everything you need to get started:**

**1. Contributing Guidelines**

We have a `## Contributing` section in the README.md that covers contribution guidelines. The approach is to create a new branch and open a PR. No specific naming convention — use whatever you're comfortable with.

**2. Environment Setup**

Here are the env files — please keep them safe and don't share with anyone. They're tied to actual billing accounts.

Once you unzip the file, you'll see a folder structure. Just move the env files into your project following the same structure. Let me know if you run into any issues.

**3. Running the App**

The latest code is on the `provider_search` branch. First, run it with:

```shellscript
NEXT_PUBLIC_LIVE_CALL_ENABLED=true
```

in `apps/api/.env` so you see the expected output without making real calls.

Once you're comfortable with the code, you can set `NEXT_PUBLIC_LIVE_CALL_ENABLED=false` to have it make actual calls. Test with your own phone number first by setting:

```shellscript
NEXT_PUBLIC_ADMIN_TEST_NUMBER=your_phone_number
```

**4. Kestra**

Our app uses Kestra for orchestration, and it's currently running locally on my machine. You don't need to set up Kestra locally — I'm setting up Kestra Cloud for us. In the meantime, leave this in your `apps/.env`:

```properties
KESTRA_ENABLED=false
```

This will have the app fallback to direct API calls.

**5. Supabase**

Our app uses Supabase, but you don't need to set it up locally — we're using Supabase from the cloud. The env files have everything you need.

**6. Documentation**

Check out these docs to get a quick understanding of how the code works and what we're building:
- `README.md` — Setup and contributing guidelines
- `docs/architecture.md` — System overview
- `docs/3_DAY_HACKATHON_PLAN.md` — Project plan

**7. Tasks**

Once you're comfortable with the code, take a look at `docs/3_DAY_HACKATHON_SPRINT.md` for the most critical tasks we still need to complete.

**8. Questions?**

If you have questions about anything or would like me to walk you through the app, feel free to ping me!
