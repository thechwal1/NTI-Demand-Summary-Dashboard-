CREATE TABLE "nti_items" (
	"item_number" text PRIMARY KEY,
	"name" text NOT NULL,
	"price" double precision NOT NULL,
	"classification" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" serial PRIMARY KEY,
	"store_id" text NOT NULL,
	"store_name" text NOT NULL,
	"filename" text NOT NULL,
	"label" text NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"total_items" double precision NOT NULL,
	"total_value" double precision NOT NULL,
	"unique_skus" integer NOT NULL,
	"matched" integer NOT NULL,
	"results" jsonb NOT NULL,
	"not_found" jsonb NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"username" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;