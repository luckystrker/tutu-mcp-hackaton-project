# Demo script

Use the generated dates and current preflight ranking. Never promise a fixed
winning city before live provider data has been checked.

## Roles

| Persona | Origin          | Distinct constraint         | Operator            |
| ------- | --------------- | --------------------------- | ------------------- |
| Данил   | Москва          | lower budget, quiet/history | presenter/organizer |
| Саша    | Санкт-Петербург | no air, food preference     | account 2           |
| Катя    | Нижний Новгород | tighter budget              | account 3           |
| Маша    | Казань          | later outbound window       | account 4           |

The fifth person is the demo operator. They watch health, logs and metrics and
do not click through the primary scenario.

## Script

1. Show `/health/build`, then create a four-person trip and share the Telegram
   invite. State the pitch: Rendezvous computes which city the group should
   choose before anyone searches for a route to a predetermined destination.
2. Danil and Sasha submit different private constraints. Show the preliminary
   ranking and one score breakdown; do not expose either participant's budget.
3. Katya joins. Pause on the announced ranking movement and participant spokes.
4. Masha joins. Show four routes converging on the currently winning city.
5. Move efficiency toward fairness, then return to the Balance preset. Call out
   that there is no provider spinner because this is deterministic rescore.
6. Open Why/compare for a losing city and distinguish computed facts from
   optional LLM wording.
7. Add reactions, save the shortlist and finalize as organizer.
8. Show two accounts' different personal routes and open only preflight-checked
   Tutu links.

## Fallback narration

If the operator enables fixture fallback, keep the lime “Demo fixture / not live
Tutu results” banner visible and say that the interaction is replaying a saved,
redacted provider-compatible example. Never describe it as current availability.
