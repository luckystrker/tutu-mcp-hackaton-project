ALTER TABLE rendezvous.shortlist
  ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);

ALTER TABLE rendezvous.final_selections
  ADD COLUMN revision integer,
  ADD COLUMN ranking_version integer;

UPDATE rendezvous.final_selections f
SET revision = r.revision,
    ranking_version = r.ranking_version
FROM rendezvous.destination_results d
JOIN rendezvous.trip_results r ON r.id = d.trip_result_id
WHERE d.id = f.destination_result_id;

ALTER TABLE rendezvous.final_selections
  ALTER COLUMN revision SET NOT NULL,
  ALTER COLUMN ranking_version SET NOT NULL;
