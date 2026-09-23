CREATE TABLE `mutation_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_ok` integer DEFAULT 1 NOT NULL,
	`hours_ok` integer DEFAULT 1 NOT NULL,
	`settings_ok` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "SLOT_FULL" CHECK("mutation_guards"."slot_ok"=1),
	CONSTRAINT "OUTSIDE_HOURS" CHECK("mutation_guards"."hours_ok"=1),
	CONSTRAINT "SETTINGS_CONFLICT" CHECK("mutation_guards"."settings_ok"=1)
);
