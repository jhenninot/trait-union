CREATE TYPE "public"."genre_personne" AS ENUM('homme', 'femme');--> statement-breakpoint
CREATE TYPE "public"."type_relation" AS ENUM('parent', 'conjoint');--> statement-breakpoint
CREATE TABLE "personnes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cercle_id" uuid NOT NULL,
	"utilisateur_id" uuid,
	"prenom" text NOT NULL,
	"nom" text,
	"genre" "genre_personne",
	"date_naissance" date,
	"decede" boolean DEFAULT false NOT NULL,
	"date_deces" date,
	"telephone" text,
	"adresse" text,
	"avatar" text,
	"a_savoir" text,
	"visible_aide" boolean DEFAULT true NOT NULL,
	"cree_par_id" uuid
);
--> statement-breakpoint
CREATE TABLE "relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cercle_id" uuid NOT NULL,
	"type" "type_relation" NOT NULL,
	"personne_a" uuid NOT NULL,
	"personne_b" uuid NOT NULL,
	"separes" boolean DEFAULT false NOT NULL,
	CONSTRAINT "relations_unique" UNIQUE("type","personne_a","personne_b")
);
--> statement-breakpoint
ALTER TABLE "anniversaires_envoyes" ALTER COLUMN "utilisateur_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "anniversaires_envoyes" ADD COLUMN "personne_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "personne_id" uuid;--> statement-breakpoint
ALTER TABLE "personnes" ADD CONSTRAINT "personnes_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnes" ADD CONSTRAINT "personnes_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnes" ADD CONSTRAINT "personnes_cree_par_id_utilisateurs_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_personne_a_personnes_id_fk" FOREIGN KEY ("personne_a") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_personne_b_personnes_id_fk" FOREIGN KEY ("personne_b") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personnes_cercle_idx" ON "personnes" USING btree ("cercle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personnes_cercle_utilisateur_idx" ON "personnes" USING btree ("cercle_id","utilisateur_id");--> statement-breakpoint
CREATE INDEX "relations_cercle_idx" ON "relations" USING btree ("cercle_id");--> statement-breakpoint
ALTER TABLE "anniversaires_envoyes" ADD CONSTRAINT "anniversaires_envoyes_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_personne_id_personnes_id_fk" FOREIGN KEY ("personne_id") REFERENCES "public"."personnes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anniversaires_envoyes" ADD CONSTRAINT "anniversaires_envoyes_personne_unique" UNIQUE("personne_id","annee");