-- Document table for RAG
CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`mimeType` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Document chunk table for RAG vectors
CREATE TABLE `documentChunk` (
	`id` text PRIMARY KEY NOT NULL,
	`documentId` text NOT NULL,
	`chunkIndex` integer NOT NULL,
	`content` text NOT NULL,
	`vectorId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`documentId`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Conversation table for AI chat
CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`title` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Message table for AI chat
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
