CREATE TYPE "public"."moment_sondage" AS ENUM('journee', 'midi', 'soir', 'heure');--> statement-breakpoint
ALTER TYPE "public"."type_message" ADD VALUE 'sondage';--> statement-breakpoint
CREATE TABLE "sondage_reponses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"sondage_id" uuid NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"reponses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"commentaire" text,
	"repondu_par_id" uuid,
	CONSTRAINT "sondage_reponses_unique" UNIQUE("sondage_id","utilisateur_id")
);
--> statement-breakpoint
CREATE TABLE "sondages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"cercle_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"cree_par_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"lieu" text,
	"moment" "moment_sondage" DEFAULT 'journee' NOT NULL,
	"heure" text,
	"dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"date_limite" date,
	"date_retenue" date,
	"rendez_vous_id" uuid,
	"clos_par_id" uuid,
	"relance_le" timestamp with time zone,
	"relance_auto_le" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sondage_reponses" ADD CONSTRAINT "sondage_reponses_sondage_id_sondages_id_fk" FOREIGN KEY ("sondage_id") REFERENCES "public"."sondages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_reponses" ADD CONSTRAINT "sondage_reponses_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondage_reponses" ADD CONSTRAINT "sondage_reponses_repondu_par_id_utilisateurs_id_fk" FOREIGN KEY ("repondu_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondages" ADD CONSTRAINT "sondages_cercle_id_cercles_id_fk" FOREIGN KEY ("cercle_id") REFERENCES "public"."cercles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondages" ADD CONSTRAINT "sondages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondages" ADD CONSTRAINT "sondages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondages" ADD CONSTRAINT "sondages_cree_par_id_utilisateurs_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondages" ADD CONSTRAINT "sondages_rendez_vous_id_rendez_vous_id_fk" FOREIGN KEY ("rendez_vous_id") REFERENCES "public"."rendez_vous"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sondages" ADD CONSTRAINT "sondages_clos_par_id_utilisateurs_id_fk" FOREIGN KEY ("clos_par_id") REFERENCES "public"."utilisateurs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sondages_message_unique" ON "sondages" USING btree ("message_id");