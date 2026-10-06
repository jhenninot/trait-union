CREATE TABLE "photos_jeu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"personne_id" uuid NOT NULL,
	"cercle_id" uuid NOT NULL,
	"jeton" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos_jeu" ADD CONSTRAINT "photos_jeu_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos_jeu" ADD CONSTRAINT "photos_jeu_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_jeu_cercle_idx" ON "photos_jeu" USING btree ("cercle_id","personne_id");