CREATE TABLE "compteurs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"jour" date NOT NULL,
	"canal" text NOT NULL,
	"cercle_id" uuid,
	"nombre" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "compteurs_unique" UNIQUE NULLS NOT DISTINCT("jour","canal","cercle_id")
);
--> statement-breakpoint
ALTER TABLE "compteurs" ADD CONSTRAINT "compteurs_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;