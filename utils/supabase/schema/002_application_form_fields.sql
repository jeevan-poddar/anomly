ALTER TABLE institutions
    ADD COLUMN IF NOT EXISTS institution_category TEXT,
    ADD COLUMN IF NOT EXISTS railway_station TEXT,
    ADD COLUMN IF NOT EXISTS railway_distance_km NUMERIC(8,2),
    ADD COLUMN IF NOT EXISTS bank_name TEXT;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'application-documents',
    'application-documents',
    FALSE,
    10485760,
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
