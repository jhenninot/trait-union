CREATE TABLE "scores_quiz" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	"aide_id" uuid NOT NULL,
	"joueur_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"questions" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scores_quiz" ADD CONSTRAINT "scores_quiz_aide_id_utilisateurs_id_fk" FOREIGN KEY ("aide_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores_quiz" ADD CONSTRAINT "scores_quiz_joueur_id_utilisateurs_id_fk" FOREIGN KEY ("joueur_id") REFERENCES "public"."utilisateurs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scores_quiz_aide" ON "scores_quiz" USING btree ("aide_id","questions");