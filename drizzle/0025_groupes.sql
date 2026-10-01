ALTER TYPE "public"."type_conversation" ADD VALUE 'groupe';--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_unique";--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "titre" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "membres_groupe" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "cree_par_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_cree_par_id_utilisateurs_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_unique" ON "conversations" USING btree ("cercle_id","type",coalesce("personne_a", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("personne_b", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "conversations"."type" in ('famille', 'aidants', 'liaison', 'privee');