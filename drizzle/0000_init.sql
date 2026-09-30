CREATE TYPE "public"."role_membre" AS ENUM('accompagne', 'aidant', 'proche');--> statement-breakpoint
CREATE TABLE "cercles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"nom" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cercle_id" uuid NOT NULL,
	"prenom" text NOT NULL,
	"nom" text,
	"email" text,
	"role" "role_membre" DEFAULT 'proche' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membres" ADD CONSTRAINT "membres_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membres_cercle_email_idx" ON "membres" USING btree ("cercle_id","email");