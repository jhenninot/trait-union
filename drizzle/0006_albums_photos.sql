CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cercle_id" uuid NOT NULL,
	"cree_par_id" uuid,
	"nom" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "album_id" uuid;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_cree_par_id_utilisateurs_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "albums_cercle_idx" ON "albums" USING btree ("cercle_id");--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_album_idx" ON "photos" USING btree ("album_id");