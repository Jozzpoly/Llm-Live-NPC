# Isolated SPC Research Worker — one-shot staging activation

This documentation-only commit deliberately triggers one new Cloudflare Workers Build from
the owner's explicitly selected Git production branch:
`staging/spc-research-first-luna-20261011`.

- Intended Worker name: `llm-live-npc-spc-research` (not existing `llm-live-npc`).
- Build command: `node scripts/spc-research-build.mjs`.
- Deploy command: `npx wrangler deploy --config dist/llm_live_npc_spc_research/wrangler.json`.
- The verified application/source baseline is `af52d3d1262734caae5114e48af08da949ab630c`;
  this commit changes documentation only, no source, runtime, secrets, API use or production code.
- Operator confirms Cloudflare Production runtime secrets named `OPENAI_API_KEY` and
  `SPC_RESEARCH_OPERATOR_TOKEN` have been configured. NEVER copy secret values into Git.
- OpenAI project: `SPC Research.` with owner-confirmed enforced $0.50 monthly hard limit.
- No API inference is authorized by this documentation push. Before pressing the manual
  cognition button verify the deployed research Worker, health endpoint, unauthorized
  POST denial, configured model and one-shot budget safeguard.
- Production Worker and `main` must remain untouched.
