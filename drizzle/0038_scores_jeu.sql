DROP INDEX "scores_quiz_aide";--> statement-breakpoint
ALTER TABLE "scores_quiz" ADD COLUMN "jeu" text DEFAULT 'musique' NOT NULL;--> statement-breakpoint
CREATE INDEX "scores_quiz_aide" ON "scores_quiz" USING btree ("aide_id","jeu","questions");