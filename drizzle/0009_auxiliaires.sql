ALTER TYPE "public"."role_membre" ADD VALUE 'auxiliaire';--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD COLUMN "auxiliaires" boolean DEFAULT false NOT NULL;