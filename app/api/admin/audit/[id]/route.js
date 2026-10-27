import { connection } from "next/server";
import {
  getAdminSupabaseClient,
  getMongoDatabase,
  isInstitutionId,
  withoutSignedUrls,
} from "../../../../../lib/admin-audit.js";

function errorResponse(error, status) {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function firstObject(...values) {
  return values.find(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value),
  ) ?? {};
}

function optionalObject(...values) {
  const result = firstObject(...values);
  return Object.keys(result).length > 0 ? result : null;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

export async function GET(_request, { params }) {
  await connection();
  const { id } = await params;
  if (!isInstitutionId(id)) {
    return errorResponse("A valid institution id is required.", 400);
  }

  try {
    const supabase = getAdminSupabaseClient();
    const { data: institution, error: institutionError } = await supabase
      .from("institutions")
      .select(
        "id, institution_name, institution_category, trust_type, trust_name, registration_number, registration_date, chairman_name, chairman_mobile, chairman_email, state, district, campus_address, pincode, railway_station, railway_distance_km, total_land_acres, land_ownership_type, survey_numbers, instructional_area_sqm, building_approval_authority, program_level, course_name, requested_intake, proposed_faculty, trust_pan, bank_name, bank_account_number, ifsc_code, corpus_fund_amount, status, created_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (institutionError) {
      console.error("Unable to fetch institution audit profile:", institutionError);
      return errorResponse("Unable to load the institution audit dossier.", 500);
    }
    if (!institution) {
      return errorResponse("Institution not found.", 404);
    }

    const { data: documents, error: documentsError } = await supabase
      .from("application_documents")
      .select(
        "id, document_type, file_name, storage_path, file_size_bytes, forensic_status, extracted_metadata, created_at",
      )
      .eq("institution_id", id)
      .order("created_at", { ascending: true });

    if (documentsError) {
      console.error("Unable to fetch institution audit documents:", documentsError);
      return errorResponse("Unable to load the institution audit dossier.", 500);
    }

    const database = await getMongoDatabase();
    const metadataRecord = await database
      .collection("document_metadata")
      .findOne({ institution_id: id }, { projection: { _id: 0 } });
    const mongoFiles = Array.isArray(metadataRecord?.files)
      ? metadataRecord.files
      : [];
    const reviewDecision = await database
      .collection("audit_decisions")
      .find({ institution_id: id })
      .sort({ reviewed_at: -1 })
      .limit(1)
      .next();

    const auditDocuments = await Promise.all((documents ?? []).map(async (document) => {
      const mongoFile = mongoFiles.find(
        (file) =>
          file.storage_path === document.storage_path ||
          file.file_name === document.file_name ||
          file.document_type === document.document_type,
      );
      const extractedMetadata = {
        ...firstObject(mongoFile?.metadata),
        ...firstObject(mongoFile?.extracted_metadata),
        ...firstObject(mongoFile?.extraction),
        ...firstObject(document.extracted_metadata),
      };

      const { data: signedUrlData, error: signedUrlError } = await supabase
        .storage.from("application-documents")
        .createSignedUrl(document.storage_path, 60 * 10);
      if (signedUrlError) {
        console.error(
          `Unable to create preview URL for application document ${document.id}:`,
          signedUrlError,
        );
      }

      return {
        id: document.id,
        documentType: document.document_type,
        name: document.file_name,
        fileSizeBytes: document.file_size_bytes,
        createdAt: document.created_at,
        documentUrl: signedUrlData?.signedUrl ?? null,
        documentPreviewError: signedUrlError
          ? "Unable to create a preview link for this uploaded document."
          : null,
        forensicStatus:
          (document.forensic_status &&
          document.forensic_status !== "PENDING"
            ? document.forensic_status
            : null) ??
          mongoFile?.forensic_status ??
          extractedMetadata.forensic_status ??
          document.forensic_status ??
          "PENDING",
        extractionStatus:
          mongoFile?.extraction_status ??
          metadataRecord?.extraction_status ??
          "PENDING",
        forensics: firstObject(
          extractedMetadata.forensics,
          extractedMetadata.forensic,
          extractedMetadata.tampering,
          extractedMetadata.forensic_result,
          mongoFile?.forensics,
          mongoFile?.tampering,
        ),
        geminiForensics: optionalObject(
          extractedMetadata.geminiForensics,
          mongoFile?.geminiForensics,
        ),
        extraction: firstObject(
          extractedMetadata.extraction,
          extractedMetadata.ocr,
          extractedMetadata.structuredVision,
          extractedMetadata.structured_vision,
          mongoFile?.extraction,
          mongoFile?.ocr,
          mongoFile?.extracted_metadata,
          extractedMetadata,
        ),
        metadata: withoutSignedUrls(mongoFile ?? {}),
      };
    }));

    const reconciliationLogs = firstValue(
      metadataRecord?.reconciliation_logs,
      metadataRecord?.reconciliationLogs,
      metadataRecord?.reconciliation?.logs,
      metadataRecord?.reconciliation?.history,
      [],
    );
    const reconciliation = firstObject(
      metadataRecord?.reconciliation,
      metadataRecord?.reconciliation_result,
      metadataRecord?.reconciliationResult,
    );
    const auditReport = firstObject(
      metadataRecord?.audit_report,
      metadataRecord?.auditReport,
      metadataRecord?.report,
    );
    const reportFindings = Array.isArray(auditReport.evidenceDossier)
      ? auditReport.evidenceDossier.filter(
          (finding) =>
            finding?.outcome === "FAILED" || finding?.outcome === "REVIEW",
        )
      : [];

    return Response.json(
      {
        dossier: {
          institution: {
            id: institution.id,
            institutionName: institution.institution_name,
            institutionCategory: institution.institution_category,
            trustType: institution.trust_type,
            trustName: institution.trust_name,
            registrationNumber: institution.registration_number,
            registrationDate: institution.registration_date,
            chairmanName: institution.chairman_name,
            chairmanMobile: institution.chairman_mobile,
            chairmanEmail: institution.chairman_email,
            state: institution.state,
            district: institution.district,
            campusAddress: institution.campus_address,
            pincode: institution.pincode,
            railwayStation: institution.railway_station,
            railwayDistance: institution.railway_distance_km,
            landAreaAcres: institution.total_land_acres,
            landOwnershipType: institution.land_ownership_type,
            surveyNumbers: institution.survey_numbers,
            instructionalAreaSqm: institution.instructional_area_sqm,
            buildingApprovalAuthority: institution.building_approval_authority,
            programLevel: institution.program_level,
            courseName: institution.course_name,
            requestedIntake: institution.requested_intake,
            proposedFaculty: institution.proposed_faculty,
            trustPan: institution.trust_pan,
            bankName: institution.bank_name,
            bankAccountNumber: institution.bank_account_number,
            ifscCode: institution.ifsc_code,
            corpusFundAmount: institution.corpus_fund_amount,
            status: institution.status,
            submittedAt: institution.created_at,
          },
          documents: auditDocuments,
          reconciliation,
          reconciliationLogs: withoutSignedUrls(reconciliationLogs),
          discrepancies: firstValue(
            reconciliation.discrepancies,
            reconciliation.flags,
            metadataRecord?.discrepancies,
            metadataRecord?.reconciliation_flags,
            reportFindings,
            [],
          ),
          auditReport: withoutSignedUrls(auditReport),
          reviewDecision: reviewDecision
            ? withoutSignedUrls({
                verdict: reviewDecision.verdict,
                notes: reviewDecision.notes,
                reviewedAt: reviewDecision.reviewed_at,
              })
            : null,
          mongoMetadata: withoutSignedUrls(metadataRecord ?? {}),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Institution audit dossier request failed:", error);
    return errorResponse("Unable to load the institution audit dossier.", 500);
  }
}
