# Demo release evidence

This directory owns the executable checklist and human evidence for stage 10.
Do not mark a live/provider check complete from fixture-only output.

- [Release checklist](release-checklist.md)
- [Demo script](demo-script.md)
- [Incident and rollback runbook](runbook.md)
- [Known limitations](known-limitations.md)
- [Rehearsal log](rehearsals.md)
- [Frontend technical audit](frontend-audit.md)

Generate the date-relative persona template with `npm run demo:dataset`. Check a
running environment with `DEMO_BASE_URL=https://… DEMO_REQUIRE_RELEASE_METADATA=true
npm run demo:preflight`. The command emits JSON evidence with `checkedAt` and
never prints credentials.
