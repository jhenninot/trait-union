CREATE TABLE "anniversaires_envoyes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"annee" integer NOT NULL,
	CONSTRAINT "anniversaires_envoyes_unique" UNIQUE("utilisateur_id","annee")
);
--> statement-breakpoint
ALTER TABLE "utilisateurs" ALTER COLUMN "alertes" SET DEFAULT '{"rendezVous":true,"photos":true,"anniversaires":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "anniversaires_envoyes" ADD CONSTRAINT "anniversaires_envoyes_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;