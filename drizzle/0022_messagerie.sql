CREATE TYPE "public"."type_conversation" AS ENUM('famille', 'aidants', 'liaison', 'privee');--> statement-breakpoint
CREATE TYPE "public"."type_message" AS ENUM('texte', 'rapide', 'photo', 'vocal');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cercle_id" uuid NOT NULL,
	"type" "type_conversation" NOT NULL,
	"personne_a" uuid,
	"personne_b" uuid,
	"dernier_message_le" timestamp with time zone,
	CONSTRAINT "conversations_unique" UNIQUE NULLS NOT DISTINCT("cercle_id","type","personne_a","personne_b")
);
--> statement-breakpoint
CREATE TABLE "lectures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"lu_jusqu_a" timestamp with time zone,
	"muet" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lectures_unique" UNIQUE("conversation_id","utilisateur_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"cercle_id" uuid NOT NULL,
	"auteur_id" uuid NOT NULL,
	"type" "type_message" DEFAULT 'texte' NOT NULL,
	"texte" text,
	"accompagne_id" uuid,
	"fichier" jsonb,
	"publie" boolean DEFAULT true NOT NULL,
	"retire_le" timestamp with time zone,
	"retire_par_id" uuid
);
--> statement-breakpoint
ALTER TABLE "utilisateurs" ADD COLUMN "messagerie" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_personne_a_utilisateurs_id_fk" FOREIGN KEY ("personne_a") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_personne_b_utilisateurs_id_fk" FOREIGN KEY ("personne_b") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_auteur_id_utilisateurs_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_accompagne_id_utilisateurs_id_fk" FOREIGN KEY ("accompagne_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_retire_par_id_utilisateurs_id_fk" FOREIGN KEY ("retire_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conversation_cree_idx" ON "messages" USING btree ("conversation_id","cree_le");--> statement-breakpoint
CREATE INDEX "messages_cercle_cree_idx" ON "messages" USING btree ("cercle_id","cree_le");