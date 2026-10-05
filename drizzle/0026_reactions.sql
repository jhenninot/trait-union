CREATE TABLE "reactions_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" uuid NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	CONSTRAINT "reactions_message_unique" UNIQUE("message_id","utilisateur_id")
);
--> statement-breakpoint
ALTER TABLE "reactions_message" ADD CONSTRAINT "reactions_message_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions_message" ADD CONSTRAINT "reactions_message_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;