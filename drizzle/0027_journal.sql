CREATE TABLE "journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"niveau" text NOT NULL,
	"source" text NOT NULL,
	"module" text NOT NULL,
	"message" text NOT NULL,
	"details" text,
	"utilisateur_id" uuid
);
--> statement-breakpoint
ALTER TABLE "journal" ADD CONSTRAINT "journal_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_cree_le_idx" ON "journal" USING btree ("cree_le");