# Tester model access

## Two model roles

Keep generation and advisory review independently configurable. The curriculum lead remains the approver; the reviewer model can flag gaps and cite evidence, but cannot change plan content or workflow state.

```text
Teacher action
  ├─ Generate → generator profile → structured lesson draft
  └─ Ask for guidance → reviewer profile → evidence-linked suggestions
                                            │
                                  teacher decides what to edit
                                            │
                                  lead alone returns/publishes
```

The current server configuration supports separate model names:

| Path | Generator | Advisory reviewer | Shared settings |
|---|---|---|---|
| API OpenAI-compatible adapter | `LLM_GENERATOR_MODEL` | `LLM_REVIEWER_MODEL` (reserved for the API advisory-review path) | `LLM_BASE_URL`, `LLM_API_KEY` |
| Playground direct OpenAI-compatible endpoint (Baseten today) | `BASETEN_GENERATOR_MODEL` | `BASETEN_REVIEWER_MODEL` | `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY` |
| Playground through an OpenAI-compatible proxy (LiteLLM today) | `LITELLM_GENERATOR_MODEL` | `LITELLM_REVIEWER_MODEL` | `OPENAI_COMPATIBLE_PROXY_BASE_URL`, `OPENAI_COMPATIBLE_PROXY_API_KEY` |

`LLM_MODEL` and `LITELLM_MODEL` remain compatibility fallbacks. Both routes use the same OpenAI-compatible chat-completions adapter; the endpoint profile selects direct access or a proxy. The two keys are different credentials because they belong to different services. LiteLLM's upstream Baseten key stays a server-side proxy setting and is not a playground key. LiteLLM aliases can point to different underlying models and spend policies. The scoped proxy key includes both configured role aliases. Model names are recorded with each run so reports and traces identify which role made the call.

## BYOK tester flow

## Local demo mode

Start the Compose demo with `pnpm demo:up`. The command prepares local secrets, builds and starts the app plus shared services, migrates and seeds the database, checks health, and prints access URLs. `pnpm demo:check` reruns the health check and URL summary.

The app header has a runtime **LLM mode** selector. Mock mode returns deterministic sample plans and needs no key. Live mode uses the server-configured OpenAI-compatible endpoint. The selection lasts until the API restarts; startup mode comes from `LLM_PROVIDER` in `.env.local`.

If live credentials are missing, the app lists the required variable names and keeps mock mode active. Set `LLM_API_KEY`, `LLM_GENERATOR_MODEL`, and, for Compose, `COMPOSE_LLM_BASE_URL` in `.env.local`, then restart the API. Never enter a provider key in the browser.

When the tester BYOK UI is added, use one profile per role:

```ts
type ModelProfile = {
  endpoint: 'mock' | 'direct-openai-compatible' | 'openai-compatible-proxy'
  model: string
  apiKey?: string
}

type TesterModelSettings = {
  generator: ModelProfile
  reviewer: ModelProfile
}
```

Resolve `endpoint` to a server-side endpoint preset. Do not let a tester submit arbitrary server-side URLs without outbound-host validation. A configured mock profile stays available and needs no key. Allow separate model names and keys so a tester can use a faster generator and a stronger reviewer, or the same model for both. Direct and proxy profiles share the OpenAI-compatible request/response adapter; they differ in endpoint and credential.

Keep entered keys in page memory for the session, send them only to the authenticated API over HTTPS for the selected call, and discard them when the session ends. Never write them to local storage, the application database, `.env.local`, request logs, traces, error messages, or generated reports. Redact authorization headers at the HTTP and OpenTelemetry boundaries. Show the selected provider/model and cost after the call, never the key. A later version could add an explicit encrypted server-side credential vault with expiry and revocation; it is unnecessary for the first tester flow.

The current app has environment-configured provider credentials. The tester-facing BYOK form and request-scoped credential path are future work; add them after the normal product flow is stable.
