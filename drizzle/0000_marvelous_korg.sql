CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`arrival` text,
	`service` text DEFAULT '' NOT NULL,
	`followup` integer DEFAULT 0 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'booked' NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_event` text NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appointments_date_time` ON `appointments` (`date`,`time`);--> statement-breakpoint
CREATE INDEX `appointments_patient_date` ON `appointments` (`patient_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `appointments_request_unique` ON `appointments` (`request_id`);--> statement-breakpoint
CREATE TABLE `clinic_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`open` text DEFAULT '10:00' NOT NULL,
	`close` text DEFAULT '16:00' NOT NULL,
	`capacity` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`type` text NOT NULL,
	`entity_id` text NOT NULL,
	`actor` text NOT NULL,
	`at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_id_unique` ON `events` (`id`);--> statement-breakpoint
CREATE INDEX `events_entity` ON `events` (`entity_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`hn` text NOT NULL,
	`name` text NOT NULL,
	`dob` text NOT NULL,
	`sex` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patients_hn_unique` ON `patients` (`hn`);