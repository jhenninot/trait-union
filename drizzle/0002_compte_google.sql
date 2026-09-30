ALTER TYPE "public"."type_session" ADD VALUE 'google' BEFORE 'appareil';--> statement-breakpoint
ALTER TABLE "utilisateurs" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_google_id_unique" UNIQUE("google_id");