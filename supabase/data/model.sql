-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.appliances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  appliance_name character varying,
  type character varying,
  qty integer,
  use_hours_night double precision,
  wattage double precision,
  energy_consumption double precision,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT appliances_pkey PRIMARY KEY (id),
  CONSTRAINT appliances_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.application_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  language USER-DEFINED,
  last_saved_path character varying,
  other_settings jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT application_settings_pkey PRIMARY KEY (id),
  CONSTRAINT application_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.authentications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  password_hash character varying,
  password_salt character varying,
  current_jwt character varying,
  jwt_issued_at timestamp with time zone,
  device_id uuid,
  is_logged_in boolean DEFAULT false,
  last_active timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT true,
  CONSTRAINT authentications_pkey PRIMARY KEY (id),
  CONSTRAINT authentication_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.bank_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bank_name character varying,
  account_name character varying,
  account_number character varying,
  qr_code character varying,
  CONSTRAINT bank_accounts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  name character varying,
  location character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT true,
  CONSTRAINT branches_pkey PRIMARY KEY (id),
  CONSTRAINT branches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL UNIQUE,
  user_id uuid,
  organization_id uuid,
  full_name character varying,
  phone_number character varying,
  email character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT customers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.distributor_financials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  distributor_id uuid,
  user_id uuid,
  commission_amount double precision,
  payment_status character varying,
  notes character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT distributor_financials_pkey PRIMARY KEY (id),
  CONSTRAINT distributor_financials_distributor_id_fkey FOREIGN KEY (distributor_id) REFERENCES public.distributors(id),
  CONSTRAINT distributor_financials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.distributors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying,
  referral_code character varying UNIQUE,
  discount_percent integer,
  bank_account_name character varying,
  bank_account_no character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  email text,
  CONSTRAINT distributors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  doc_type USER-DEFINED,
  file_name character varying,
  file_path character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT documents_pkey PRIMARY KEY (id),
  CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  user_id uuid,
  amount double precision,
  status USER-DEFINED,
  issued_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.notification_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  event_type text,
  recipient_user_id uuid,
  recipient_role text,
  payload json,
  status text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  error text,
  CONSTRAINT notification_jobs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  plan_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT true,
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.password_reset_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  verification_code text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_verified boolean DEFAULT false,
  role text,
  CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid,
  amount double precision,
  method character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_type character varying NOT NULL,
  billing_cycle character varying NOT NULL,
  base_price double precision NOT NULL,
  price_per_extra_employee double precision DEFAULT 0,
  CONSTRAINT pricing_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pricing_discounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid,
  min_employees integer,
  max_employees integer,
  discount_rate double precision,
  CONSTRAINT pricing_discounts_pkey PRIMARY KEY (id),
  CONSTRAINT pricing_discounts_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.pricing(id)
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  customer_id uuid,
  organization_id uuid,
  status USER-DEFINED,
  project_location character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT projects_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT projects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.subscription_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subscription_id uuid,
  amount double precision,
  payment_method character varying,
  trx_no character varying,
  trx_screenshot character varying,
  status USER-DEFINED,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT subscription_payments_pkey PRIMARY KEY (id),
  CONSTRAINT subscription_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  type USER-DEFINED,
  status USER-DEFINED,
  expiration_date timestamp with time zone,
  grace_period_end timestamp with time zone,
  license_code character varying,
  tampered boolean DEFAULT false,
  last_heartbeat_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.sync_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  sync_type USER-DEFINED,
  table_name character varying,
  status USER-DEFINED,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_dirty boolean,
  deleted_at timestamp with time zone,
  CONSTRAINT sync_logs_pkey PRIMARY KEY (id),
  CONSTRAINT sync_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.system_configurations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  config_items jsonb,
  total_wattage double precision,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT system_configurations_pkey PRIMARY KEY (id),
  CONSTRAINT system_configurations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  username character varying,
  email character varying,
  business_name character varying,
  account_type USER-DEFINED,
  location character varying,
  business_logo character varying,
  business_email character varying,
  status USER-DEFINED,
  organization_id uuid,
  branch_id uuid,
  role character varying,
  distributor_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  is_dirty boolean DEFAULT false,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT users_distributor_id_fkey FOREIGN KEY (distributor_id) REFERENCES public.distributors(id),
  CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
