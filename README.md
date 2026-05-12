# Model Cost & Prompt Optimizer

Optimize AI costs by migrating from expensive large models to cost-effective smaller models (Qwen 4B) while maintaining performance through intelligent prompt optimization.

**Live App:** [web-interface-sooty.vercel.app](https://web-interface-sooty.vercel.app)

## Video Walkthrough

A video walkthrough demonstrating the full workflow is available here:

[Watch the demo](https://drive.google.com/file/d/14O9haRAl_wq2LV5PYmmxlSqOIwLiTdJc/view?usp=sharing)

---

## How It Works

The system has two main workflows: **Single Analysis** for testing individual transcripts, and **Bulk Analysis** for processing CSVs at scale.

### Authentication

All access is protected by a daily rotating 6-digit PIN.

1. Visit the app -- you'll be redirected to the login page.
2. Enter admin credentials (email + password) to reveal today's PIN.
3. The PIN changes every day at midnight UTC. Share it with your team for that day's access.
4. Session lasts 24 hours.

### Single Transcript Analysis

This mode lets you test prompt optimization on a single transcript interactively.

**Step 1 -- Input**
- Paste a call transcript into the text area.
- Define one or more variables to extract (name, type, description).
- If the transcript contains garbled Hindi text (MacRoman encoding), it's auto-corrected and a notice is shown.

**Step 2 -- Optimize Prompts**
- The system sends each variable's prompt to **Minimax M2P7** (the optimizer model) to rewrite it following Qwen 4B best practices.
- You see the original vs optimized prompt side-by-side, with a list of improvements and rationale.
- Choose which prompt (original or optimized) to use for each variable.

**Step 3 -- Analyze**
- The selected prompts are sent to the **Qwen 4B** evaluation model along with the transcript.
- Results show the extracted value, reasoning, latency, and raw model output for each variable.
- Failed results can be retried individually or in bulk.

**Try Another Transcript**
- After viewing results, click "Try Another Transcript" to reuse the same variables and optimized prompts with a new transcript -- no need to re-optimize.

### Bulk Transcript Analysis

This mode processes hundreds or thousands of transcripts against multiple variables in the background.

**Input**

1. **CSV File** -- Upload a CSV with these columns:
   - Required: `interaction_id`, `contact_id`, `transcript`
   - Optional: `scheduled_time`, `campaign_name`, `schedule_start_at`, `schedule_end_at`
   - Ground truth (optional): For each variable, include `{var_name}_value` and `{var_name}_reason` columns to enable accuracy comparison.

2. **Variables JSON** -- Paste or upload a JSON array. Each variable needs:
   ```json
   {
     "var_name": "rebooked_pickup",
     "var_type": "boolean",
     "description": "Your prompt instructions here..."
   }
   ```

**Processing**

- All (row x variable) combinations are flattened into tasks.
- Tasks run **10 at a time** concurrently for speed.
- Each transcript is sent to Qwen 4B with the extraction prompt. The model returns `{"value": ..., "reason": "..."}`.
- If ground truth columns exist:
  - `value` is compared directly (case-insensitive for booleans).
  - On mismatch, both reasonings are sent to **Minimax M2P7** to analyze the difference.
- Progress is shown live with a progress bar, current row, and current variable.

**Partial Downloads**

- Results CSV and Metrics CSV are written after every batch of 10 tasks.
- You can download partial results at any time while the job is running -- no need to wait for completion.

**Cancellation**

- Click "Cancel" on a running job to stop it after the current batch.
- Partial results remain downloadable.

**Output Files**

1. **Results CSV** -- Contains all original CSV columns plus, for each variable:
   - `{var_name}_predicted_value` -- the model's extracted value
   - `{var_name}_predicted_reason` -- the model's reasoning
   - `{var_name}_match` -- whether prediction matches ground truth (if GT exists)
   - `{var_name}_difference` -- Minimax analysis of why the prediction differs (only on mismatches)

2. **Metrics CSV** -- For each variable with ground truth:
   - `accuracy`, `precision`, `recall`, `f1_score`
   - `true_positives`, `false_positives`, `true_negatives`, `false_negatives`
   - `total_rows`

**File Retention**

- Job files are retained for **2 hours** after creation, then automatically cleaned up.

### Validation Warnings

When both CSV and variables are loaded, the system cross-validates:

- Missing required CSV columns (`transcript`, `interaction_id`).
- Per variable: whether `{var_name}_value` and `{var_name}_reason` columns exist.
- Warns if `_value` exists without `_reason` (difference analysis will be limited).
- Warns if neither exists (analysis-only mode, no ground truth comparison).

---

## Architecture

```
User
 |
 v
[Login Page] -- credentials --> [/api/auth/login] --> session cookie
 |
 v
[Single Analysis]                    [Bulk Analysis]
 |                                    |
 |-- /api/optimize                    |-- /api/bulk/start
 |   (Minimax M2P7 rewrites          |   (parse CSV, create background job)
 |    prompts for Qwen 4B)           |
 |                                    |-- Background runner
 |-- /api/analyze                     |   (10 concurrent API calls per batch)
 |   (Qwen 4B extracts values        |   |
 |    from transcript)                |   |-- Qwen 4B: extract value + reason
 |                                    |   |-- Minimax M2P7: diff analysis (on mismatch)
 v                                    |   |-- Write partial results after each batch
[Results + Retry]                     |
                                      |-- /api/bulk/status/{id} (poll progress)
                                      |-- /api/bulk/download/{id} (download CSV)
                                      |-- /api/bulk/cancel/{id} (stop job)
```

### Models Used

| Model | Role | Purpose |
|-------|------|---------|
| Qwen 4B (`accounts/aryamann-ii2ajvi2ui7/deployments/gb1zhixe`) | Evaluation | Transcript analysis and variable extraction |
| Minimax M2P7 (`accounts/fireworks/models/minimax-m2p7`) | Optimizer | Prompt rewriting and difference analysis |

Both models are accessed via the Fireworks AI inference API.

### Encoding Fix

Transcripts containing Hindi (Devanagari) text that was corrupted by MacRoman encoding are automatically detected and corrected. The fix reverses the byte-level corruption by mapping MacRoman-interpreted characters back to their original UTF-8 bytes.

---

## Setup

### Environment Variables

```
FIREWORKS_API_KEY=fw_your_key_here
AUTH_EMAIL=your@email.com
AUTH_PASSWORD=your_password
SESSION_SECRET=random-64-char-string
FIREWORKS_OPTIMIZER_MODEL=accounts/fireworks/models/minimax-m2p7
FIREWORKS_EVALUATION_MODEL=accounts/aryamann-ii2ajvi2ui7/deployments/gb1zhixe
```

### Local Development

```bash
cd web-interface
cp .env.local.example .env.local   # fill in your values
npm install
npm run dev
```

### Deploy to Vercel

```bash
cd web-interface
vercel link
vercel env add FIREWORKS_API_KEY production
vercel env add AUTH_EMAIL production
vercel env add AUTH_PASSWORD production
vercel env add SESSION_SECRET production
vercel env add FIREWORKS_OPTIMIZER_MODEL production
vercel env add FIREWORKS_EVALUATION_MODEL production
vercel --prod
```

> **Note:** Bulk analysis background jobs use local filesystem storage. On Vercel's serverless architecture, the filesystem is ephemeral. For production bulk analysis, use a persistent storage backend.

---

## Project Structure

```
web-interface/
  app/
    page.tsx                          # Single analysis UI
    bulk/page.tsx                     # Bulk analysis UI
    pin/page.tsx                      # Login page
    api/
      auth/login/route.ts            # Credential login
      auth/pin/route.ts              # Daily PIN endpoint
      optimize/route.ts              # Prompt optimization
      analyze/route.ts               # Single transcript analysis
      bulk/start/route.ts            # Start bulk job
      bulk/status/[jobId]/route.ts   # Poll job progress
      bulk/download/[jobId]/route.ts # Download results
      bulk/cancel/[jobId]/route.ts   # Cancel running job
      bulk/list/route.ts             # List all jobs
  lib/
    fireworks-env.ts                  # API configuration
    fix-encoding.ts                   # MacRoman mojibake fixer
    auth.ts                           # Auth helpers
    bulk-job-runner.ts                # Core batch processing engine
    bulk-job-store.ts                 # Filesystem job storage
    bulk-csv.ts                       # CSV parse/generate
    bulk-metrics.ts                   # Accuracy/precision/recall/F1
    bulk-cleanup.ts                   # Auto-delete expired jobs
  middleware.ts                       # Auth middleware (all routes)
```

## License

MIT
