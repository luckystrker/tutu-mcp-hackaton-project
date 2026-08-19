ALTER TABLE rendezvous.shortlist
  ADD COLUMN ranking_version integer NOT NULL DEFAULT 0 CHECK (ranking_version >= 0);

UPDATE rendezvous.shortlist s
SET ranking_version = t.ranking_version
FROM rendezvous.trips t
WHERE t.id = s.trip_id;
