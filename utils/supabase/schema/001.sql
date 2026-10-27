CREATE TABLE institutions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    institution_name TEXT NOT NULL,
    institution_category TEXT NOT NULL,
    trust_type TEXT NOT NULL,
    trust_name TEXT NOT NULL,
    registration_number TEXT NOT NULL,
    registration_date DATE,
    chairman_name TEXT NOT NULL,
    chairman_mobile TEXT,
    chairman_email TEXT,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    campus_address TEXT NOT NULL,
    pincode TEXT NOT NULL,
    railway_station TEXT NOT NULL,
    railway_distance_km NUMERIC(8,2) NOT NULL,
    total_land_acres NUMERIC(5,2) NOT NULL,
    land_ownership_type TEXT NOT NULL,
    survey_numbers TEXT,
    instructional_area_sqm NUMERIC(10,2),
    building_approval_authority TEXT,
    program_level TEXT NOT NULL,
    course_name TEXT NOT NULL,
    requested_intake INTEGER NOT NULL,
    proposed_faculty INTEGER NOT NULL,
    trust_pan TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    bank_account_number TEXT,
    ifsc_code TEXT,
    corpus_fund_amount NUMERIC(15,2),
    status TEXT DEFAULT 'PENDING_REVIEW',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


CREATE TABLE application_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL, -- e.g., 'trustDeed', 'landDocuments', 'buildingPlan', 'fireNoc'
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size_bytes INTEGER,
    forensic_status TEXT DEFAULT 'PENDING',
    extracted_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
