# Release checklist

Record the release SHA, operator, environment and evidence links before checking
an item. Items labelled **live** cannot be satisfied by fixture mode.

## Identity and deployment

- [ ] Release SHA and build time match `/health/build` and Settings diagnostics.
- [ ] Clean database was migrated by the one-shot migration job.
- [ ] `/health/live` and `/health/ready` pass through the production proxy.
- [ ] Public origin is HTTPS and matches `PUBLIC_MINI_APP_URL` and BotFather.
- [ ] API replica count is exactly one; the stage-10 single-replica constraint is
      present in platform configuration.
- [ ] Previous image digests and the pre-migration database backup are recorded.

## Automated gates

- [ ] `npm run secrets:scan`
- [ ] `npm run verify` with migrated PostgreSQL
- [ ] `npm run test:e2e:fixture`
- [ ] `npm run test:e2e` against API + fake MCP/test data
- [ ] `npm run demo:preflight:live` **live**

## Product and provider

- [ ] Dynamic persona dates from `npm run demo:dataset` were confirmed against
      live route and hotel availability. **live**
- [ ] Two accounts authenticate, invite and join inside Telegram. **live**
- [ ] Ranking is shown with 2, then 3, then 4 ready participants. **live**
- [ ] Preset and slider reorder locally without MCP calls or global loading.
- [ ] Breakdown, Why, compare, reactions, shortlist and organizer finalization work.
- [ ] Every participant sees their personal route and Tutu allowlisted links. **live**
- [ ] Partial MCP failure, no-result and preserved-previous-result states are clear.
- [ ] LLM-disabled smoke completes the same core path.

## Mobile, privacy and operations

- [ ] No horizontal overflow at 320, 360 and 412 CSS pixels; text zoom at 200%
      preserves actions and labels.
- [ ] Keyboard focus, reduced motion and Telegram safe areas were checked.
- [ ] Four concurrent trip streams reconnect after a network interruption.
- [ ] Logs contain no initData, token, private constraints or exact geolocation.
- [ ] Organizer-only finalization rejects participant requests.
- [ ] Operator has logs, metrics, fixture switch instructions and rollback access.
- [ ] Two clean-user rehearsals are recorded in `rehearsals.md`.
