ALTER TABLE `checkins` ADD `photo_verified` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `age_confirmed` integer DEFAULT 0 NOT NULL;