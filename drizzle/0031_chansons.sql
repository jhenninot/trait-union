CREATE TABLE "chansons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"artiste" text NOT NULL,
	"cle" text NOT NULL,
	"source" text DEFAULT 'catalogue' NOT NULL,
	"reaction" text,
	"cree_par_id" uuid,
	CONSTRAINT "chansons_unique" UNIQUE("utilisateur_id","cle")
);
--> statement-breakpoint
ALTER TABLE "chansons" ADD CONSTRAINT "chansons_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chansons" ADD CONSTRAINT "chansons_cree_par_id_utilisateurs_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;