CREATE TYPE "public"."recurrence_rendez_vous" AS ENUM('aucune', 'quotidienne', 'hebdomadaire', 'mensuelle', 'annuelle');--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD COLUMN "recurrence" "recurrence_rendez_vous" DEFAULT 'aucune' NOT NULL;--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD COLUMN "intervalle" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD COLUMN "recurrence_fin" timestamp with time zone;