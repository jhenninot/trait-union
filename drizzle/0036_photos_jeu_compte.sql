DROP INDEX "photos_jeu_cercle_idx";--> statement-breakpoint
ALTER TABLE "photos_jeu" ALTER COLUMN "personne_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "photos_jeu" ALTER COLUMN "cercle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "photos_jeu" ADD COLUMN "utilisateur_id" uuid;--> statement-breakpoint
ALTER TABLE "photos_jeu" ADD CONSTRAINT "photos_jeu_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_jeu_personne_idx" ON "photos_jeu" USING btree ("personne_id");--> statement-breakpoint
CREATE INDEX "photos_jeu_utilisateur_idx" ON "photos_jeu" USING btree ("utilisateur_id");