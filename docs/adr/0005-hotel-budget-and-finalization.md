# ADR 0005: Hotel budget and immutable finalization

## Status

Accepted.

## Decision

- Hotel enrichment runs for the preliminary top six destinations. Only those six are eligible for the final hotel-aware solve.
- A stay needs a hotel when the common-presence dates in the destination time zone span at least one night. Same-day meetings do not require a hotel.
- The request uses one guest per ready participant, `ceil(guests / 2)` rooms, and RUB. Hotel search dates come from the common-presence interval, not from the broad trip period.
- Explicit provider availability `none` removes an overnight destination. Unknown or incomplete availability remains eligible but is marked degraded and does not add an unknown amount to budget.
- For a priced result, the cheapest valid total stay price is split in minor units by quotient and remainder. Participants are sorted by stable id and the first `remainder` participants receive one extra minor unit, so allocation is deterministic and its sum exactly equals the hotel total.
- A final selection must belong to the current trip revision and ranking version, be in the current shortlist, be valid, and contain routes for every ready participant. Overnight finals must contain a hotel result.
- Finalization stores an immutable snapshot with solver/candidate/scoring provenance. Repeating the same finalization is idempotent; selecting a different result after finalization is rejected.
- The final API projects only the requesting participant's route plus the common hotel. Booking links are exposed only when they are HTTPS links on `tutu.ru` or its subdomains.
- Availability refresh after finalization is explicit: `checkedAt` stays tied to the immutable snapshot and the user follows the allowlisted Tutu link to confirm current price/availability. The application never replaces the chosen route or hotel silently.

## Consequences

Unknown hotel prices are visible as degraded rather than silently treated as a confirmed free stay. Existing rankings remain useful during provider degradation, while explicit no-availability never produces a bookable final choice.
