import { POST as runGeminiForensicReview } from "../../../gemini/forensics-check/route.js";
import { POST as runAuditReport } from "../../../gemini/generate-audit-report/route.js";
import { POST as runDocumentReconciliation } from "../../../gemini/reconcile-documents/route.js";
import { POST as runDocumentValidation } from "../../../gemini/validate-documents/route.js";
import { GeminiConfigurationError } from "../../../../../lib/gemini.js";
import {
  detectDocumentMimeType,
  extractDocument,
} from "../../../../../lib/document-extraction.js";
import {
  getAdminSupabaseClient,
  getMongoDatabase,
  isInstitutionId,
} from "../../../../../lib/admin-audit.js";

const STORAGE_BUCKET = "application-documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIME_TYPE_BY_EXTENSION = new Map([
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

class AuditRunError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function removeNullCharacters(value) {
  if (typeof value === "string") return value.replace(/\u0000/g, "");
  if (Array.isArray(value)) return value.map(removeNullCharacters);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key.replace(/\u0000/g, ""),
        removeNullCharacters(entry),
      ]),
    );
  }
  return value;
}

function errorResponse(error, status) {
  return Response.json(
    { success: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function getMimeType(filename, blobType) {
  if (["application/pdf", "image/png", "image/jpeg"].includes(blobType)) {
    return blobType;
  }
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  return extension ? MIME_TYPE_BY_EXTENSION.get(extension) : undefined;
}

function uploadRequest(filename, mimeType, buffer) {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([buffer], { type: mimeType }),
    filename,
  );
  return new Request("http://internal/api/audit-pipeline", {
    method: "POST",
    body: formData,
  });
}

async function jsonRequest(handler, body, label) {
  return readApiResponse(
    handler(
      new Request("http://internal/api/audit-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
    label,
  );
}

async function readApiResponse(responsePromise, label) {
  const response = await responsePromise;
  let result;
  try {
    result = await response.json();
  } catch {
    throw new AuditRunError(`${label} returned an invalid response.`, 502);
  }
  if (!response.ok) {
    throw new AuditRunError(
      result?.error || `${label} failed.`,
      response.status >= 500 ? 502 : response.status,
    );
  }
  if (!isRecord(result)) {
    throw new AuditRunError(`${label} returned an invalid response.`, 502);
  }
  return result;
}

async function processDocument(document, supabase) {
  const { data: file, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(document.storage_path);
  if (error || !file) {
    console.error(`Unable to download audit document ${document.id}:`, error);
    throw new AuditRunError(
      `Unable to download "${document.file_name}" for audit processing.`,
      502,
    );
  }
  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    throw new AuditRunError(
      `"${document.file_name}" is empty or exceeds the 10 MB processing limit.`,
      400,
    );
  }

  const mimeType = getMimeType(document.file_name, file.type);
  if (!mimeType) {
    throw new AuditRunError(
      `"${document.file_name}" is not a supported PDF, PNG, or JPEG document.`,
      415,
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedMimeType = detectDocumentMimeType(buffer);
  if (!detectedMimeType) {
    throw new AuditRunError(
      `"${document.file_name}" is not a supported PDF, PNG, or JPEG document.`,
      415,
    );
  }
  if (detectedMimeType !== mimeType) {
    throw new AuditRunError(
      `The stored file type for "${document.file_name}" does not match its contents.`,
      400,
    );
  }
  const requestForFile = () => uploadRequest(document.file_name, mimeType, buffer);

  const extractionPromise = extractDocument(buffer, mimeType).catch((error) => {
    if (error instanceof GeminiConfigurationError) {
      console.error("Document extraction is not configured:", error.message);
      throw new AuditRunError("Document extraction is not configured.");
    }
    console.error(`Document extraction failed for "${document.file_name}":`, error);
    throw new AuditRunError(
      `Unable to extract structured document data from "${document.file_name}".`,
      502,
    );
  });
  const [forensicReview, extraction] = await Promise.all([
    readApiResponse(
      runGeminiForensicReview(requestForFile()),
      `Gemini forensic review for "${document.file_name}"`,
    ),
    extractionPromise,
  ]);
  if (!isRecord(forensicReview.forensics)) {
    throw new AuditRunError(
      `Gemini forensic review for "${document.file_name}" returned no forensic analysis.`,
      502,
    );
  }
  const { forensics, ...geminiForensics } = forensicReview;

  return {
    ...document,
    mimeType,
    extraction: {
      ...extraction,
      document_type: extraction.document_type || document.document_type,
    },
    forensics,
    geminiForensics,
  };
}

function combineForensics(documents) {
  const providerFlags = documents.flatMap(({ file_name, authenticity }) => {
    const result = authenticity?.authenticity;
    const provider = authenticity?.provider;
    if (!result || provider?.status !== "VERIFIED") return [];

    const flags = result.flags.map((message) => ({
      code: "provider_authenticity_flag",
      severity: result.authentic ? "info" : "critical",
      message,
      documents: [file_name],
    }));
    flags.push({
      code: result.authentic
        ? "provider_authenticity_verified"
        : "provider_authenticity_rejected",
      severity: result.authentic ? "info" : "critical",
      message: result.authentic
        ? `The external authenticity provider verified this document${result.confidence === undefined ? "." : ` (confidence ${result.confidence}).`}`
        : `The external authenticity provider rejected this document${result.confidence === undefined ? "." : ` (confidence ${result.confidence}).`}`,
      documents: [file_name],
      details: {
        provider: provider.provider,
        ...(result.documentType ? { documentType: result.documentType } : {}),
        ...(result.referenceId ? { referenceId: result.referenceId } : {}),
      },
    });
    return flags;
  });

  return {
    filename: documents.map(({ file_name }) => file_name).join(", "),
    result: {
      tamper_detected: documents.some(({ forensics, authenticity }) =>
        forensics.tamper_detected === true ||
        (authenticity?.provider?.status === "VERIFIED" &&
          authenticity.authenticity?.authentic === false),
      ),
      flags: [
        ...documents.flatMap(({ file_name, forensics }) =>
        (forensics.flags ?? []).map((flag) => ({
          ...flag,
          documents: [file_name],
        })),
        ),
        ...providerFlags,
      ],
    },
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must contain valid JSON.", 400);
  }

  if (!isRecord(body) || !isInstitutionId(body.institutionId)) {
    return errorResponse("A valid institutionId is required.", 400);
  }

  const institutionId = body.institutionId;
  try {
    const supabase = getAdminSupabaseClient();
    const { data: institution, error: institutionError } = await supabase
      .from("institutions")
      .select(
        "id, institution_name, trust_name, registration_number, chairman_name, chairman_mobile, chairman_email, pincode, requested_intake, proposed_faculty, total_land_acres, instructional_area_sqm, course_name",
      )
      .eq("id", institutionId)
      .maybeSingle();
    if (institutionError) {
      console.error("Unable to load institution for audit processing:", institutionError);
      throw new AuditRunError("Unable to load the institution for audit processing.");
    }
    if (!institution) {
      throw new AuditRunError("Institution not found.", 404);
    }

    const { data: documents, error: documentsError } = await supabase
      .from("application_documents")
      .select("id, document_type, file_name, storage_path, extracted_metadata")
      .eq("institution_id", institutionId)
      .order("created_at", { ascending: true });
    if (documentsError) {
      console.error("Unable to load audit documents:", documentsError);
      throw new AuditRunError("Unable to load the institution's audit documents.");
    }
    if (!documents?.length) {
      throw new AuditRunError(
        "There are no application documents to process.",
        400,
      );
    }

    const processedDocuments = await Promise.all(
      documents.map((document) => processDocument(document, supabase)),
    );
    const reconciliation = await jsonRequest(
      runDocumentReconciliation,
      {
        documents: processedDocuments.map(
          ({ file_name, extraction }) => ({
            filename: file_name,
            extraction,
          }),
        ),
        institution: {
          institutionName: institution.institution_name,
          trustName: institution.trust_name,
          registrationNumber: institution.registration_number,
          requestedIntake: institution.requested_intake,
          proposedFaculty: institution.proposed_faculty,
          landAreaAcres: institution.total_land_acres,
          instructionalAreaSqm: institution.instructional_area_sqm,
          courseName: institution.course_name,
        },
      },
      "Document reconciliation",
    );
    const validation = await jsonRequest(
      runDocumentValidation,
      {
        documents: processedDocuments.map(({ file_name, extraction }) => ({
          filename: file_name,
          extraction,
        })),
        institution: {
          institutionName: institution.institution_name,
          trustName: institution.trust_name,
          registrationNumber: institution.registration_number,
          chairmanName: institution.chairman_name,
          chairmanMobile: institution.chairman_mobile,
          chairmanEmail: institution.chairman_email,
          pincode: institution.pincode,
          requestedIntake: institution.requested_intake,
          proposedFaculty: institution.proposed_faculty,
          landAreaAcres: institution.total_land_acres,
          instructionalAreaSqm: institution.instructional_area_sqm,
          courseName: institution.course_name,
        },
      },
      "Document expiry and input validation",
    );
    const flags = [...reconciliation.flags, ...validation.expiryChecks.flags];
    const criticalFlags = flags.filter((flag) => flag.severity === "CRITICAL");
    const warningFlags = flags.filter((flag) => flag.severity === "WARNING");
    const combinedReconciliation = {
      ...reconciliation,
      status: criticalFlags.length
        ? "REJECTED"
        : flags.length
          ? "DEFICIENT"
          : "APPROVED",
      confidence_score: Math.max(
        0,
        Number((1 - criticalFlags.length * 0.15 - warningFlags.length * 0.05).toFixed(2)),
      ),
      flags,
      inputValidation: validation.inputValidation,
      summary: {
        ...reconciliation.summary,
        totalFlags: flags.length,
        criticalFlags: criticalFlags.length,
        warningFlags: warningFlags.length,
      },
    };
    const report = await jsonRequest(
      runAuditReport,
      {
        tampering: combineForensics(processedDocuments),
        structuredVision: processedDocuments.map(
          ({ file_name, extraction }) => ({
            filename: file_name,
            result: extraction,
          }),
        ),
        crossDocument: {
          filename: "Cross-document reconciliation",
          result: combinedReconciliation,
        },
        digitalSignatureEvidence: {
          filename: processedDocuments.map(({ file_name }) => file_name).join(", "),
          result: {
            documents: processedDocuments.map(({ file_name, forensics }) => ({
              filename: file_name,
              ...(forensics.evidence?.digitalSignature ?? {
                status: "NOT_DETECTED",
                markers: [],
              }),
            })),
          },
        },
      },
      "Audit report generation",
    );

    const updateResults = await Promise.all(
      processedDocuments.map(async (document) =>
        supabase
          .from("application_documents")
          .update({
            forensic_status: document.forensics.tamper_detected
              ? "FLAGGED"
              : "PASSED",
            extracted_metadata: removeNullCharacters({
              ...Object.fromEntries(
                Object.entries(
                  isRecord(document.extracted_metadata)
                    ? document.extracted_metadata
                    : {},
                ).filter(
                  ([key]) =>
                    ![
                      "signature",
                      "signatureVerification",
                      "signature_verification",
                    ].includes(key),
                ),
              ),
              extraction: document.extraction,
              forensics: document.forensics,
              geminiForensics: document.geminiForensics,
            }),
          })
          .eq("id", document.id)
          .eq("institution_id", institutionId),
      ),
    );
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) {
      console.error("Unable to persist audit document results:", updateError);
      throw new AuditRunError("Unable to save the audit document results.");
    }

    const database = await getMongoDatabase();
    const generatedAt = new Date();
    const reconciliationLog = {
      run_id: report.reportId,
      generated_at: generatedAt.toISOString(),
      status: combinedReconciliation.status,
      confidence_score: combinedReconciliation.confidence_score,
      documents_checked: reconciliation.summary?.documentsChecked ?? processedDocuments.length,
      total_flags: combinedReconciliation.summary?.totalFlags ?? flags.length,
      critical_flags: combinedReconciliation.summary?.criticalFlags ?? 0,
      warning_flags: combinedReconciliation.summary?.warningFlags ?? 0,
      recommendation: report.recommendation,
      weighted_severity_score: report.weightedSeverityScore,
      flag_codes: combinedReconciliation.flags.map((flag) => flag.code),
    };
    await database.collection("document_metadata").updateOne(
      { institution_id: institutionId },
      {
        $set: {
          extraction_status: "COMPLETED",
          files: processedDocuments.map((document) => ({
            document_type: document.document_type,
            file_name: document.file_name,
            storage_path: document.storage_path,
            extraction_status: "COMPLETED",
            forensic_status: document.forensics.tamper_detected
              ? "FLAGGED"
              : "PASSED",
            extraction: document.extraction,
            forensics: document.forensics,
            geminiForensics: document.geminiForensics,
          })),
          reconciliation: combinedReconciliation,
          reconciliation_result: combinedReconciliation,
          discrepancies: combinedReconciliation.flags,
          audit_report: report,
          updated_at: generatedAt,
        },
        $push: {
          reconciliation_logs: {
            $each: [reconciliationLog],
            $slice: -50,
          },
        },
      },
      { upsert: true },
    );

    return Response.json(
      {
        success: true,
        institutionId,
        processedDocuments: processedDocuments.length,
        geminiReviews: processedDocuments.map(
          ({ id, file_name, geminiForensics }) => ({
            documentId: id,
            filename: file_name,
            review: geminiForensics,
          }),
        ),
        reconciliation: combinedReconciliation,
        report,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuditRunError) {
      return errorResponse(error.message, error.status);
    }
    console.error("Institution audit test failed:", error);
    return errorResponse("Unable to complete the institution audit test.", 500);
  }
}
