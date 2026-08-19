ALTER TABLE rendezvous.reactions
  DROP CONSTRAINT reactions_value_check;

UPDATE rendezvous.reactions SET value = 'dislike' WHERE value = 'no';

ALTER TABLE rendezvous.reactions
  ADD CONSTRAINT reactions_value_check
  CHECK (value IN ('love', 'ok', 'dislike'));
