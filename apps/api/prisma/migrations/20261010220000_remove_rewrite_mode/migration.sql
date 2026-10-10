-- All future generations use rewriting. Keep other route and queued-operation settings.
UPDATE "Route"
SET "options" = "options" - 'mode'
WHERE "options" ? 'mode';

UPDATE "Operation"
SET "options" = "options" - 'mode'
WHERE "options" ? 'mode';

-- Preserve AiRun options as the historical settings of already completed model calls.
