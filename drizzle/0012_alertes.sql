CREATE TYPE "public"."type_appareil" AS ENUM('web', 'android');--> statement-breakpoint
CREATE TABLE "appareils_alertes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"session_id" uuid,
	"type" "type_appareil" NOT NULL,
	"adresse" text NOT NULL,
	"cles" jsonb,
	"libelle" text,
	CONSTRAINT "appareils_alertes_adresse_unique" UNIQUE("adresse")
);
--> statement-breakpoint
CREATE TABLE "rappels_envoyes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"rendez_vous_id" uuid NOT NULL,
	"occurrence" integer NOT NULL,
	"prevu_le" timestamp with time zone NOT NULL,
	CONSTRAINT "rappels_envoyes_unique" UNIQUE("rendez_vous_id","occurrence","prevu_le")
);
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "alerte_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD COLUMN "rappel" integer;--> statement-breakpoint
ALTER TABLE "utilisateurs" ADD COLUMN "alertes" jsonb DEFAULT '{"rendezVous":true,"photos":true}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "appareils_alertes" ADD CONSTRAINT "appareils_alertes_utilisateur_id_utilisateurs_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appareils_alertes" ADD CONSTRAINT "appareils_alertes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rappels_envoyes" ADD CONSTRAINT "rappels_envoyes_rendez_vous_id_rendez_vous_id_fk" FOREIGN KEY ("rendez_vous_id") REFERENCES "public"."rendez_vous"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appareils_alertes_utilisateur_idx" ON "appareils_alertes" USING btree ("utilisateur_id");--> statement-breakpoint
-- Les photos déjà publiées ne déclenchent pas d'alerte
UPDATE "photos" SET "alerte_le" = now();
