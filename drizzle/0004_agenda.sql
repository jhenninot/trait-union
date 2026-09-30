CREATE TYPE "public"."visibilite_rendez_vous" AS ENUM('tous', 'aidants', 'accompagne', 'accompagne_aidants');--> statement-breakpoint
CREATE TABLE "rendez_vous" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cercle_id" uuid NOT NULL,
	"cree_par_id" uuid,
	"titre" text NOT NULL,
	"lieu" text,
	"notes" text,
	"debut" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone,
	"journee_entiere" boolean DEFAULT false NOT NULL,
	"visibilite" "visibilite_rendez_vous" DEFAULT 'tous' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_cree_par_id_utilisateurs_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rendez_vous_cercle_debut_idx" ON "rendez_vous" USING btree ("cercle_id","debut");