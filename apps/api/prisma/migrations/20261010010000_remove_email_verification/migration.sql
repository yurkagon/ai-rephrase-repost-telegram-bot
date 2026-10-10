-- Email confirmation/recovery is removed; Telegram linking tokens stay valid.
DELETE FROM "AccountToken" WHERE "kind" IN ('verify', 'reset');
ALTER TABLE "users" DROP COLUMN "emailVerifiedAt";
