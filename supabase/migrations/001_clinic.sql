-- Run once on a new Supabase project, in SQL Editor or with pnpm db:migrate.
-- A private schema: patient records are not exposed through Supabase's Data API.
CREATE SCHEMA clinic;
REVOKE ALL ON SCHEMA clinic FROM PUBLIC, anon, authenticated;

CREATE TABLE clinic.staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE clinic.patients (
  id text PRIMARY KEY, hn text NOT NULL UNIQUE, name text NOT NULL,
  dob text NOT NULL, sex text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at text NOT NULL, updated_at text NOT NULL, last_event text
);
CREATE TABLE clinic.clinic_settings (
  id integer PRIMARY KEY CHECK(id=1),
  open text NOT NULL DEFAULT '10:00', close text NOT NULL DEFAULT '16:00',
  capacity integer NOT NULL DEFAULT 1 CHECK(capacity BETWEEN 1 AND 20),
  version integer NOT NULL DEFAULT 1, last_event text
);
INSERT INTO clinic.clinic_settings(id) VALUES(1);
CREATE TABLE clinic.appointments (
  id text PRIMARY KEY, patient_id text NOT NULL REFERENCES clinic.patients(id),
  date text NOT NULL, time text NOT NULL, arrival text,
  service text NOT NULL DEFAULT '', followup integer NOT NULL DEFAULT 0 CHECK(followup IN (0,1)),
  tags text NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(tags::jsonb)='array'),
  status text NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','waiting','diagnosed','home','cancelled','no_show')),
  seen integer NOT NULL DEFAULT 0 CHECK(seen IN (0,1)), remarks text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1, created_at text NOT NULL, updated_at text NOT NULL,
  last_event text NOT NULL, request_id text NOT NULL UNIQUE
);
CREATE INDEX appointments_date_time ON clinic.appointments(date,time);
CREATE INDEX appointments_patient_date ON clinic.appointments(patient_id,date);
CREATE UNIQUE INDEX appointments_active_patient_time ON clinic.appointments(patient_id,date,time)
  WHERE status NOT IN ('cancelled','no_show');
CREATE TABLE clinic.events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id text NOT NULL UNIQUE, type text NOT NULL, entity_id text NOT NULL,
  actor text NOT NULL, at text NOT NULL, payload text NOT NULL
);
CREATE INDEX events_entity ON clinic.events(entity_id,sequence);
CREATE TABLE clinic.mutation_guards (
  id text PRIMARY KEY,
  slot_ok boolean NOT NULL DEFAULT true CONSTRAINT "SLOT_FULL" CHECK(slot_ok),
  hours_ok boolean NOT NULL DEFAULT true CONSTRAINT "OUTSIDE_HOURS" CHECK(hours_ok),
  settings_ok boolean NOT NULL DEFAULT true CONSTRAINT "SETTINGS_CONFLICT" CHECK(settings_ok)
);
-- Defense in depth: no browser roles have access, even if schema exposure is changed.
ALTER TABLE clinic.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.mutation_guards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA clinic FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA clinic FROM PUBLIC, anon, authenticated;
