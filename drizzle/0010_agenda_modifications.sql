ALTER TABLE "rendez_vous" ADD COLUMN "exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD COLUMN "modifie_par_id" uuid;--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_modifie_par_id_utilisateurs_id_fk" FOREIGN KEY ("modifie_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;