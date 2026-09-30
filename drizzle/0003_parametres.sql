CREATE TABLE "parametres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cle" text NOT NULL,
	"valeur" jsonb NOT NULL,
	CONSTRAINT "parametres_cle_unique" UNIQUE("cle")
);
