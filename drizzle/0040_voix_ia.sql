CREATE TABLE "voix_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cercle_id" uuid NOT NULL,
	"cle_chiffree" text NOT NULL,
	"modele" text DEFAULT 'ministral-8b-latest' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	CONSTRAINT "voix_ia_cercle_id_unique" UNIQUE("cercle_id")
);
--> statement-breakpoint
ALTER TABLE "voix_ia" ADD CONSTRAINT "voix_ia_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;