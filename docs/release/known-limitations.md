# Known limitations

- The hackathon API deployment is single-replica. Durable job claiming is safe,
  but SSE fan-out and in-memory operational metrics are not shared across API
  processes.
- Fixture fallback is a separate visibly marked build. It contains deterministic
  sample data and cannot prove current Tutu availability.
- Live Tutu contract checks are preflight/scheduled checks rather than ordinary
  CI because provider/network failures would make CI nondeterministic.
- The web uses same-origin proxying for REST/SSE. A separate browser-visible API
  origin requires deliberate CSP and CORS changes.
- Rehearsal timings and Telegram/BotFather configuration require human access and
  cannot be certified from repository tests.
