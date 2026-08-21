# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Rendezvous serves groups whose members travel from different cities and need to
agree on a fair meeting destination. Each participant enters private travel and
budget constraints, reviews a shared ranking, and helps choose a final city.
The app runs both as a Telegram Mini App and as a regular responsive web app.

## Product Purpose

Rendezvous compares real transport and accommodation options, applies every
participant's hard constraints and preferences, and produces an explainable,
fair ranking of meeting cities. Success means that a group can move from an
invitation to a shared shortlist and final destination without exposing private
participant constraints.

## Positioning

The product selects the meeting point from all participants' journeys rather
than asking the group to start with a destination. Its ranking is deterministic
and balances cost, travel time, synchronization, time together, and fairness of
burden across the group.

## Operating Context

- An organizer creates a trip and shares an invite through Telegram or a web
  link.
- Participants independently enter private constraints and preferences.
- The group follows live recomputation, compares destinations, reacts, creates
  a shortlist, and finalizes one option.
- The application supports an API-backed mode and a self-contained fixture mode
  for demonstrations.

## Capabilities and Constraints

- English and Russian are supported. A saved local preference wins; otherwise
  the initial language is inferred from Telegram `language_code`, then browser
  languages, with English as the fallback.
- Language preference is local to the device and is not synchronized through a
  user account or stored as trip state.
- All system-authored UI, validation, errors, explanations, generated content,
  accessibility labels, and formatting use the active language.
- User-authored content remains exactly as entered and is never automatically
  translated.
- Each participant can use a different language while viewing the same trip.
- Hard constraints, scoring, fairness, and ranking remain deterministic and
  language-independent. LLM output may only phrase already computed facts.
- PostgreSQL is canonical application state; Tutu MCP supplies normalized travel
  facts; private participant constraints do not enter group projections, logs,
  metrics, SSE events, or LLM prompts.

## Brand Commitments

The product is named Rendezvous. Its existing warm, editorial travel-journal
identity is retained. Language settings must fit the incumbent interface rather
than introduce a separate visual system.

## Evidence on Hand

- Product requirements: `../../docs/spec/SPEC.md`
- Existing design system: `DESIGN.md`
- Main product flow: `src/pages/TripPages.tsx`
- Shared API contracts: `../../packages/contracts/src`
- Deterministic demo data: `../../packages/domain/src/fixtures/demo.ts` and
  `src/demo/fixtures.ts`

## Product Principles

- Make the group decision explainable without exposing private inputs.
- Keep computation deterministic and localization outside scoring behavior.
- Let every participant use the product in their own language independently.
- Translate system communication completely; never rewrite user-authored text.
- Preserve a useful degraded experience when providers, LLM, or live updates
  are unavailable.

## Accessibility & Inclusion

Language changes apply immediately, update document language metadata, and keep
the current task and route intact. Controls use language autonyms (`English`,
`Русский`) and remain understandable to users who cannot read the currently
active locale. Existing keyboard, focus, semantic, and mobile touch-target
requirements remain binding.
