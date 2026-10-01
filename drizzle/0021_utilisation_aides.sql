CREATE TABLE "utilisation_jour" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"jour" date NOT NULL,
	"ecrans" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"derniere_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utilisation_jour_unique" UNIQUE("utilisateur_id","jour")
);
--> statement-breakpoint
ALTER TABLE "utilisation_jour" ADD CONSTRAINT "utilisation_jour_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;