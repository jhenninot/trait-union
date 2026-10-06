ALTER TABLE "relations" ADD COLUMN "maries" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "relations" SET "maries" = true WHERE "type" = 'conjoint';
