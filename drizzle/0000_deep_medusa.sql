CREATE TABLE `checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`community_id` integer,
	`drink_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`amount_raw` real NOT NULL,
	`unit_label` text NOT NULL,
	`amount_ml` integer NOT NULL,
	`points` integer NOT NULL,
	`photo_key` text NOT NULL,
	`flagged` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`drink_id`) REFERENCES `drinks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `checkins_user_idx` ON `checkins` (`user_id`);--> statement-breakpoint
CREATE INDEX `checkins_community_idx` ON `checkins` (`community_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `checkins_created_at_idx` ON `checkins` (`created_at`);--> statement-breakpoint
CREATE TABLE `communities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '🍻' NOT NULL,
	`invite_code` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communities_invite_code_idx` ON `communities` (`invite_code`);--> statement-breakpoint
CREATE TABLE `community_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_members_unique_idx` ON `community_members` (`community_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `community_members_community_idx` ON `community_members` (`community_id`);--> statement-breakpoint
CREATE INDEX `community_members_user_idx` ON `community_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `drinks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`abv` real NOT NULL,
	`note` text,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drinks_category_idx` ON `drinks` (`category`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`is_admin` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);