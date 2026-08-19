ALTER TABLE rendezvous.trip_results
  ADD COLUMN candidate_algorithm_version text NOT NULL DEFAULT 'unknown';

CREATE INDEX event_outbox_trip_cursor_idx
  ON rendezvous.event_outbox(trip_id, id);
