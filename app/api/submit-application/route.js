import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getMongoDatabase } from "../../../lib/mongodb.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const STORAGE_BUCKET = "application-documents";
const DOCUMENT_FIELDS = [
  ["trustDeed", "trustDeed"],
  ["landDeed", "landDocuments"],
  ["buildingPlan", "buildingPlan"],
  ["fireSafetyNoc", "fireNoc"],
];
const REQUIRED_TEXT_FIELDS = [
  "sponsoringBodyType",
  "sponsoringBodyName",
  "registrationNumber",
  "registrationDate",
  "chairmanName",
  "chairmanMobile",
  "chairmanEmail",
  "institutionName",
  "institutionCategory",
  "state",
  "district",
  "campusAddress",
  "pincode",
  "railwayStation",
  "landArea",
  "landOwnershipType",
  "surveyNumbers",
  "buildingPlanAuthority",
  "programLevel",
  "courseName",
  "sanctionedIntake",
  "facultyCount",
  "trustPan",
  "bankName",
  "bankAccountNumber",
  "ifscCode",
];

function errorResponse(error, status) {
  return Response.json({ success: false, error }, { status });
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function requiredText(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(formData, name, { integer = false, required = true } = {}) {
  const value = requiredText(formData, name);
  if (!value && !required) return null;
  const number = Number(value);
  return Number.isFinite(number) && (!integer || Number.isInteger(number))
    ? number
    : null;
}

async function validateForm(formData) {
  const missing = REQUIRED_TEXT_FIELDS.filter(
    (field) => !requiredText(formData, field),
  );
  if (missing.length) {
    return { error: `Missing required fields: ${missing.join(", ")}.` };
  }

  const files = [];
  for (const [field, documentType] of DOCUMENT_FIELDS) {
    const file = formData.get(field);
    if (!file || typeof file === "string") {
      return { error: `The ${field} PDF file is required.` };
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return {
        error: `${field} must be a non-empty PDF no larger than 10 MB.`,
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (
      buffer.length < 5 ||
      buffer.subarray(0, 5).toString("ascii") !== "%PDF-" ||
      (file.type && file.type !== "application/pdf")
    ) {
      return { error: `${field} must be a valid PDF file.` };
    }
    files.push({ field, documentType, file, buffer });
  }

  const registrationDate = requiredText(formData, "registrationDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(registrationDate)) {
    return { error: "registrationDate must be a valid YYYY-MM-DD date." };
  }
  const parsedRegistrationDate = new Date(`${registrationDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedRegistrationDate.getTime()) ||
    parsedRegistrationDate.toISOString().slice(0, 10) !== registrationDate
  ) {
    return { error: "registrationDate must be a valid YYYY-MM-DD date." };
  }

  const chairmanEmail = requiredText(formData, "chairmanEmail");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chairmanEmail)) {
    return { error: "chairmanEmail must be a valid email address." };
  }
  if (!/^\d{6}$/.test(requiredText(formData, "pincode"))) {
    return { error: "pincode must contain exactly 6 digits." };
  }

  const landArea = parseNumber(formData, "landArea");
  const railwayDistance = parseNumber(formData, "railwayDistance");
  const instructionalArea = parseNumber(formData, "builtUpArea");
  const requestedIntake = parseNumber(formData, "sanctionedIntake", {
    integer: true,
  });
  const proposedFaculty = parseNumber(formData, "facultyCount", {
    integer: true,
  });
  const corpusFundAmount = parseNumber(formData, "corpusFundAmount");

  if (
    landArea === null ||
    landArea < 0 ||
    railwayDistance === null ||
    railwayDistance < 0 ||
    instructionalArea === null ||
    instructionalArea < 0 ||
    requestedIntake === null ||
    requestedIntake < 1 ||
    proposedFaculty === null ||
    proposedFaculty < 0 ||
    corpusFundAmount === null ||
    corpusFundAmount < 0
  ) {
    return { error: "One or more numeric application fields are invalid." };
  }

  return {
    data: {
      registrationDate,
      landArea,
      railwayDistance,
      instructionalArea,
      requestedIntake,
      proposedFaculty,
      corpusFundAmount,
      files,
    },
  };
}

export async function POST(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    return errorResponse("Content-Type must be multipart/form-data.", 415);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Request body is not valid multipart form data.", 400);
  }

  let validated;
  try {
    validated = await validateForm(formData);
  } catch (error) {
    console.error("Unable to read application uploads:", error);
    return errorResponse("Unable to process uploaded documents.", 400);
  }
  if (validated.error) return errorResponse(validated.error, 400);

  let supabase;
  let institutionId;
  const uploadedPaths = [];

  try {
    supabase = getSupabaseClient();
    const database = validated.data;
    const { data: institution, error: institutionError } = await supabase
      .from("institutions")
      .insert({
        institution_name: requiredText(formData, "institutionName"),
        institution_category: requiredText(formData, "institutionCategory"),
        trust_type: requiredText(formData, "sponsoringBodyType"),
        trust_name: requiredText(formData, "sponsoringBodyName"),
        registration_number: requiredText(formData, "registrationNumber"),
        registration_date: database.registrationDate,
        chairman_name: requiredText(formData, "chairmanName"),
        chairman_mobile: requiredText(formData, "chairmanMobile") || null,
        chairman_email: requiredText(formData, "chairmanEmail") || null,
        state: requiredText(formData, "state"),
        district: requiredText(formData, "district"),
        campus_address: requiredText(formData, "campusAddress"),
        pincode: requiredText(formData, "pincode"),
        railway_station: requiredText(formData, "railwayStation"),
        railway_distance_km: database.railwayDistance,
        total_land_acres: database.landArea,
        land_ownership_type: requiredText(formData, "landOwnershipType"),
        survey_numbers: requiredText(formData, "surveyNumbers") || null,
        instructional_area_sqm: database.instructionalArea,
        building_approval_authority:
          requiredText(formData, "buildingPlanAuthority") || null,
        program_level: requiredText(formData, "programLevel"),
        course_name: requiredText(formData, "courseName"),
        requested_intake: database.requestedIntake,
        proposed_faculty: database.proposedFaculty,
        trust_pan: requiredText(formData, "trustPan"),
        bank_name: requiredText(formData, "bankName"),
        bank_account_number:
          requiredText(formData, "bankAccountNumber") || null,
        ifsc_code: requiredText(formData, "ifscCode") || null,
        corpus_fund_amount: database.corpusFundAmount,
      })
      .select("id")
      .single();

    if (institutionError) throw institutionError;
    institutionId = institution.id;

    const documents = [];
    for (const { documentType, file, buffer } of database.files) {
      const storagePath = `${institutionId}/${randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);

      const { data: signedUrlData, error: signedUrlError } = await supabase
        .storage.from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, 60 * 60);
      if (signedUrlError) throw signedUrlError;

      documents.push({
        document_type: documentType,
        file_name: file.name,
        storage_path: storagePath,
        file_size_bytes: buffer.length,
        forensic_status: "PENDING",
        extracted_metadata: {},
        signed_url: signedUrlData.signedUrl,
      });
    }

    const { error: documentsError } = await supabase
      .from("application_documents")
      .insert(
        documents.map(({ signed_url, ...document }) => ({
          ...document,
          institution_id: institutionId,
        })),
      );
    if (documentsError) throw documentsError;

    const mongoDatabase = await getMongoDatabase();
    await mongoDatabase.collection("document_metadata").insertOne({
      institution_id: institutionId,
      extraction_status: "PENDING",
      files: documents.map(
        ({ document_type, file_name, storage_path, file_size_bytes, signed_url }) => ({
          document_type,
          file_name,
          storage_path,
          file_size_bytes,
          signed_url,
          extraction_status: "PENDING",
        }),
      ),
      extraction_schema: {
        version: 1,
        fields: {},
        extracted_at: null,
        provider: null,
      },
      created_at: new Date(),
    });

    return Response.json({
      success: true,
      institution_id: institutionId,
      message:
        "Application files have been stored and queued for forensic and OCR pipeline validation.",
    });
  } catch (error) {
    console.error("Application submission failed:", error);

    if (supabase && uploadedPaths.length) {
      const { error: cleanupError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(uploadedPaths);
      if (cleanupError) {
        console.error("Failed to remove application uploads after error:", cleanupError);
      }
    }
    if (supabase && institutionId) {
      const { error: cleanupError } = await supabase
        .from("institutions")
        .delete()
        .eq("id", institutionId);
      if (cleanupError) {
        console.error("Failed to remove incomplete institution submission:", cleanupError);
      }
    }
    if (error?.code === "NoSuchBucket" || error?.statusCode === "404") {
      return errorResponse(
        "The application-documents storage bucket is not configured. Apply the Supabase setup migration, then try again.",
        503,
      );
    }
    return errorResponse("Unable to submit the application. Please try again.", 500);
  }
}
