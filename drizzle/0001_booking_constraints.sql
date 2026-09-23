CREATE UNIQUE INDEX IF NOT EXISTS appointments_patient_slot_active ON appointments(patient_id,date,time) WHERE status NOT IN ('cancelled','no_show');
