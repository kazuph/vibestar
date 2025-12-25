-- Create project table for organizing documents and RAG contexts
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`isDefault` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Add projectId to document table
ALTER TABLE `document` ADD `projectId` text REFERENCES `project`(`id`) ON DELETE set null;

-- Add projectId to conversation table
ALTER TABLE `conversation` ADD `projectId` text REFERENCES `project`(`id`) ON DELETE set null;
