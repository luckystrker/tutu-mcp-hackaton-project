DO $$
DECLARE
  dropped_constraint text;
BEGIN
  SELECT conname INTO dropped_constraint
  FROM pg_constraint
  WHERE conrelid = 'rendezvous.trips'::regclass
    AND contype = 'c'
    AND conname <> 'trips_period_order_check'
    AND pg_get_constraintdef(oid) ILIKE '%period_from < period_to%';
  IF dropped_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE rendezvous.trips DROP CONSTRAINT %I',
      dropped_constraint
    );
  END IF;
END $$;

ALTER TABLE rendezvous.trips
  ALTER COLUMN period_from DROP NOT NULL,
  ALTER COLUMN period_to DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS preferred_transport_modes text[] NOT NULL DEFAULT '{}';

ALTER TABLE rendezvous.trips
  ADD CONSTRAINT trips_period_order_check
  CHECK (
    period_from IS NULL
    OR period_to IS NULL
    OR period_from < period_to
  );
