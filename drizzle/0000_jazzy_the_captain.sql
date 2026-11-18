CREATE TABLE `earnings` (
	`id` text PRIMARY KEY NOT NULL,
	`referral` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`payout` text,
	FOREIGN KEY (`referral`) REFERENCES `referrals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payout`) REFERENCES `payouts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `history` (
	`id` text PRIMARY KEY NOT NULL,
	`referral` text NOT NULL,
	`state` text NOT NULL,
	`paid` integer NOT NULL,
	`commission` integer NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`referral`) REFERENCES `referrals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`bucket` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `marketers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`password` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`rate` integer NOT NULL,
	`method` text,
	`beneficiary` text,
	`account` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketers_code_unique` ON `marketers` (`code`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`marketer` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`reference` text NOT NULL,
	`method` text NOT NULL,
	`beneficiary` text NOT NULL,
	`account` text NOT NULL,
	FOREIGN KEY (`marketer`) REFERENCES `marketers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payout_marketer_reference` ON `payouts` (`marketer`,`reference`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`marketer` text NOT NULL,
	`customer` text NOT NULL,
	`project` text NOT NULL,
	`rate` integer NOT NULL,
	`date` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`commission` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`marketer`) REFERENCES `marketers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`principal` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`admin` text NOT NULL,
	`whatsapp` text DEFAULT '' NOT NULL,
	`anchor` text NOT NULL
);
