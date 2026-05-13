-- Sync cursor state per (user, device).
-- This is additive-only and safe to apply on an existing schema.

CREATE TABLE IF NOT EXISTS public.sync_state (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  last_cursor timestamptz NOT NULL DEFAULT ('2000-01-01 00:00:00+00'::timestamptz),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sync_state_pkey PRIMARY KEY (user_id, device_id)
);

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

-- Helpful index for admin/debug queries
CREATE INDEX IF NOT EXISTS idx_sync_state_device ON public.sync_state(device_id);
