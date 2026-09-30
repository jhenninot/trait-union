CREATE TABLE "albums_vus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"cercle_id" uuid NOT NULL,
	"album_id" uuid,
	"vu_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "albums_vus_unique" UNIQUE NULLS NOT DISTINCT("utilisateur_id","cercle_id","album_id")
);
--> statement-breakpoint
ALTER TABLE "albums_vus" ADD CONSTRAINT "albums_vus_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums_vus" ADD CONSTRAINT "albums_vus_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums_vus" ADD CONSTRAINT "albums_vus_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;