CREATE TABLE "blocks" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"page_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_pkey" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "database_rows" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"database_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "database_rows_pkey" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "databases" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "databases_pkey" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "group_members_pkey" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_ancestors" (
	"page_id" text NOT NULL,
	"ancestor_id" text NOT NULL,
	"depth" integer NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "page_ancestors_pkey" PRIMARY KEY("workspace_id","page_id","ancestor_id")
);
--> statement-breakpoint
CREATE TABLE "page_permissions" (
	"page_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text DEFAULT '' NOT NULL,
	"level" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "page_permissions_pkey" PRIMARY KEY("workspace_id","page_id","subject_type","subject_id"),
	CONSTRAINT "page_permissions_subject_type_check" CHECK (subject_type in ('user', 'group', 'workspace', 'public')),
	CONSTRAINT "page_permissions_level_check" CHECK (level in ('full_access', 'edit', 'comment', 'view'))
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parent_id" text GENERATED ALWAYS AS (doc ->> 'parentId') STORED,
	"visibility" text DEFAULT 'workspace' NOT NULL,
	"inherit_permissions" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pages_pkey" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "pages_visibility_check" CHECK (visibility in ('workspace', 'private'))
);
--> statement-breakpoint
CREATE TABLE "shape_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tbl" text NOT NULL,
	"workspace_id" text NOT NULL,
	"row_id" text NOT NULL,
	"op" text NOT NULL,
	"txid" bigint NOT NULL,
	"doc" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shape_log_op_check" CHECK (op in ('insert', 'update', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "user_page_access" (
	"user_id" text NOT NULL,
	"page_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "user_page_access_pkey" PRIMARY KEY("user_id","workspace_id","page_id"),
	CONSTRAINT "user_page_access_level_check" CHECK (level in ('full_access', 'edit', 'comment', 'view'))
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"inviterId" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"activeOrganizationId" text,
	CONSTRAINT "session_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_rows" ADD CONSTRAINT "database_rows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_ancestors" ADD CONSTRAINT "page_ancestors_page_fkey" FOREIGN KEY ("workspace_id","page_id") REFERENCES "public"."pages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_ancestors" ADD CONSTRAINT "page_ancestors_ancestor_fkey" FOREIGN KEY ("workspace_id","ancestor_id") REFERENCES "public"."pages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_permissions" ADD CONSTRAINT "page_permissions_page_fkey" FOREIGN KEY ("workspace_id","page_id") REFERENCES "public"."pages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_permissions" ADD CONSTRAINT "page_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_page_access" ADD CONSTRAINT "user_page_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_page_access" ADD CONSTRAINT "user_page_access_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_page_access" ADD CONSTRAINT "user_page_access_page_fkey" FOREIGN KEY ("workspace_id","page_id") REFERENCES "public"."pages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_ws_idx" ON "blocks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "blocks_page_idx" ON "blocks" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "database_rows_ws_idx" ON "database_rows" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "database_rows_db_idx" ON "database_rows" USING btree ("database_id");--> statement-breakpoint
CREATE INDEX "databases_ws_idx" ON "databases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_ws_idx" ON "groups" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "page_ancestors_anc_idx" ON "page_ancestors" USING btree ("workspace_id","ancestor_id");--> statement-breakpoint
CREATE INDEX "page_permissions_subject_idx" ON "page_permissions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "pages_ws_idx" ON "pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "shape_log_ws_idx" ON "shape_log" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "user_page_access_ws_user_idx" ON "user_page_access" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_org_idx" ON "member" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("userId");