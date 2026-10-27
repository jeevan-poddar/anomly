import { randomUUID } from "node:crypto";

const SEVERITY_SCORE = {
  CRITICAL: 100,
  HIGH: 75,
  MEDIUM: 45,
  WARNING: 30,
  LOW: 15,
  INFO: 0,
};

const SOURCE_WEIGHT = {
  tampering: 1.2,
  structuredVision: 0.8,
  crossDocument: 1.1,
  digitalSignatureEvidence: 1.2,
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorResponse(message, status = 400) {
  return Response.json({ error: message }, { status });
}

function normalizeSeverity(value) {
  if (typeof value !== "string") return "WARNING";
  const severity = value.trim().toUpperCase();
  return Object.hasOwn(SEVERITY_SCORE, severity) ? severity : "WARNING";
}

function getComponent(input, name) {
  const component = input[name];
  if (!isRecord(component)) return null;
  const result = component.result ?? component;
  return isRecord(result) ? { component, result } : null;
}

function normalizePageNumber(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function getPageForDocument(filename, structuredVision) {
  const document = structuredVision.find(
    (entry) => entry.filename === filename && entry.pageNumber !== null,
  );
  return document?.pageNumber ?? null;
}

function makeFinding({
  sourceModule,
  checkCode,
  outcome,
  severity,
  documentName = null,
  pageNumber = null,
  summary,
  evidenceSnippet,
  details,
}) {
  return {
    id: randomUUID(),
    sourceModule,
    checkCode,
    outcome,
    severity,
    severityScore: SEVERITY_SCORE[severity],
    document: {
      name: documentName,
      pageNumber: normalizePageNumber(pageNumber),
    },
    evidence: {
      summary,
      snippet: evidenceSnippet,
    },
    ...(details !== undefined ? { details } : {}),
  };
}

function makeFlagFinding(flag, sourceModule, documentName, pageNumber) {
  const severity = normalizeSeverity(flag.severity);
  const summary =
    typeof flag.message === "string" && flag.message.trim()
      ? flag.message.trim()
      : `The ${flag.code ?? "validation"} check reported a finding.`;
  const evidenceValues = Array.isArray(flag.details?.values)
    ? flag.details.values.filter(
        (entry) => isRecord(entry) && typeof entry.value === "string",
      )
    : [];
  const scopedValues =
    documentName === null
      ? evidenceValues
      : evidenceValues.filter((entry) => entry.filename === documentName);
  const values = (scopedValues.length > 0 ? scopedValues : evidenceValues).map(
    (entry) => `${entry.filename ?? "Document"}: ${entry.value}`,
  );
  const evidenceSnippet =
    values.length > 0 ? values.join(" | ") : summary;

  return makeFinding({
    sourceModule,
    checkCode:
      typeof flag.code === "string" && flag.code.trim()
        ? flag.code
        : "unspecified_check",
    outcome: severity === "INFO" ? "INFO" : "FAILED",
    severity,
    documentName,
    pageNumber,
    summary,
    evidenceSnippet,
    ...(flag.details !== undefined ? { details: flag.details } : {}),
  });
}

function validateFlagArray(component, label) {
  if (!Array.isArray(component.result.flags)) {
    return `The ${label} result must include a flags array.`;
  }
  if (component.result.flags.some((flag) => !isRecord(flag))) {
    return `Every ${label} flag must be a JSON object.`;
  }
  return null;
}

function collectFindings(input, components) {
  const findings = [];
  const structuredVision = [];
  const tamperingDocument =
    components.tampering.component.filename.trim();
  const signatureEvidence = components.digitalSignatureEvidence.result;

  for (const [index, entry] of input.structuredVision.entries()) {
    if (!isRecord(entry)) {
      return { error: `Structured vision entry ${index} must be an object.` };
    }
    const result = entry.result ?? entry;
    if (!isRecord(result)) {
      return { error: `Structured vision result ${index} must be an object.` };
    }
    const filename =
      entry.filename.trim();
    const pageNumber = normalizePageNumber(entry.pageNumber);
    const fields = [
      "institution_name",
      "trust_name",
      "document_type",
      "issue_date",
      "expiry_date",
      "qr_code_present",
      "sanctioned_intake",
      "required_faculty",
    ];
    const extractedValues = fields
      .filter((field) => result[field] !== undefined && result[field] !== null)
      .map((field) => `${field}: ${String(result[field])}`);
    if (
      typeof result.institution_name !== "string" ||
      typeof result.document_type !== "string"
    ) {
      return {
        error: `Structured vision result ${index} must include institution_name and document_type strings.`,
      };
    }
    structuredVision.push({ filename, pageNumber });
    findings.push(
      makeFinding({
        sourceModule: "structuredVision",
        checkCode: "structured_extraction_completed",
        outcome: "PASSED",
        severity: "INFO",
        documentName: filename,
        pageNumber,
        summary: "Structured vision extraction completed for this document.",
        evidenceSnippet:
          extractedValues.length > 0
            ? extractedValues.join("; ")
            : "Extraction completed; no displayable extracted fields were returned.",
      }),
    );
  }

  const tamperingResult = components.tampering.result;
  const tamperingFlagsError = validateFlagArray(components.tampering, "tampering");
  if (tamperingFlagsError) return { error: tamperingFlagsError };
  if (
    typeof tamperingResult.tamper_detected !== "boolean"
  ) {
    return { error: "The tampering result tamper_detected field must be boolean." };
  }
  for (const flag of tamperingResult.flags) {
    findings.push(
      makeFlagFinding(
        flag,
        "tampering",
        tamperingDocument,
        getPageForDocument(tamperingDocument, structuredVision),
      ),
    );
  }
  if (
    tamperingResult.tamper_detected === true &&
    !tamperingResult.flags.some(
      (flag) => normalizeSeverity(flag.severity) === "CRITICAL",
    )
  ) {
    findings.push(
      makeFinding({
        sourceModule: "tampering",
        checkCode: "tampering_detected",
        outcome: "FAILED",
        severity: "CRITICAL",
        documentName: tamperingDocument,
        pageNumber: getPageForDocument(tamperingDocument, structuredVision),
        summary: "The forensic service reported tampering.",
        evidenceSnippet:
          "tamper_detected=true; consult the forensic flags for supporting evidence.",
      }),
    );
  }
  if (
    tamperingResult.flags.length === 0 &&
    tamperingResult.tamper_detected === false
  ) {
    findings.push(
      makeFinding({
        sourceModule: "tampering",
        checkCode: "forensic_checks_completed",
        outcome: "PASSED",
        severity: "INFO",
        documentName: tamperingDocument,
        pageNumber: getPageForDocument(tamperingDocument, structuredVision),
        summary: "The forensic service reported no tampering flags.",
        evidenceSnippet: "tamper_detected=false; flags=[]",
      }),
    );
  }

  const crossFlagsError = validateFlagArray(
    components.crossDocument,
    "cross-document",
  );
  if (crossFlagsError) return { error: crossFlagsError };
  for (const flag of components.crossDocument.result.flags) {
    const listedDocuments = Array.isArray(flag.documents)
      ? [...new Set(flag.documents.filter((name) => typeof name === "string"))]
      : [];
    const detailDocuments = Array.isArray(flag.details?.values)
      ? [
          ...new Set(
            flag.details.values
              .filter((entry) => isRecord(entry))
              .map((entry) => entry.filename)
              .filter((name) => typeof name === "string"),
          ),
        ]
      : [];
    const documents =
      listedDocuments.length > 0 ? listedDocuments : detailDocuments;
    const sourceDocuments = documents.length > 0 ? documents : [null];
    for (const documentName of sourceDocuments) {
      findings.push(
        makeFlagFinding(
          flag,
          "crossDocument",
          documentName,
          documentName
            ? getPageForDocument(documentName, structuredVision)
            : null,
        ),
      );
    }
  }
  if (
    components.crossDocument.result.status === "REJECTED" &&
    !components.crossDocument.result.flags.some(
      (flag) => normalizeSeverity(flag.severity) === "CRITICAL",
    )
  ) {
    findings.push(
      makeFinding({
        sourceModule: "crossDocument",
        checkCode: "cross_document_rejection",
        outcome: "FAILED",
        severity: "CRITICAL",
        summary: "The cross-document engine returned a REJECTED status.",
        evidenceSnippet: "status=REJECTED",
      }),
    );
  }
  if (
    components.crossDocument.result.flags.length === 0 &&
    components.crossDocument.result.status === "APPROVED"
  ) {
    findings.push(
      makeFinding({
        sourceModule: "crossDocument",
        checkCode: "cross_document_checks_passed",
        outcome: "PASSED",
        severity: "INFO",
        summary:
          "The cross-document engine reported no inconsistencies or deficiencies.",
        evidenceSnippet: "status=APPROVED; flags=[]",
      }),
    );
  } else if (
    components.crossDocument.result.flags.length === 0 &&
    components.crossDocument.result.status === "DEFICIENT"
  ) {
    findings.push(
      makeFinding({
        sourceModule: "crossDocument",
        checkCode: "cross_document_deficiency",
        outcome: "FAILED",
        severity: "WARNING",
        summary:
          "The cross-document engine reported deficiencies without individual flags.",
        evidenceSnippet: "status=DEFICIENT; flags=[]",
      }),
    );
  }
  if (input.structuredVision.length === 0) {
    findings.push(
      makeFinding({
        sourceModule: "structuredVision",
        checkCode: "structured_extraction_missing",
        outcome: "REVIEW",
        severity: "WARNING",
        summary: "No structured vision extraction results were supplied.",
        evidenceSnippet: "structuredVision=[]",
      }),
    );
  }

  if (!Array.isArray(signatureEvidence.documents)) {
    return { error: "digitalSignatureEvidence.result.documents must be an array." };
  }
  for (const entry of signatureEvidence.documents) {
    if (
      !isRecord(entry) ||
      typeof entry.filename !== "string" ||
      !entry.filename.trim() ||
      !["PRESENT", "NOT_DETECTED", "NOT_APPLICABLE"].includes(entry.status) ||
      !Array.isArray(entry.markers) ||
      entry.markers.some((marker) => typeof marker !== "string")
    ) {
      return { error: "Each digital signature evidence entry must include a filename, valid status, and marker list." };
    }
    findings.push(
      makeFinding({
        sourceModule: "digitalSignatureEvidence",
        checkCode:
          entry.status === "PRESENT"
            ? "digital_signature_markers_detected"
            : "digital_signature_markers_not_detected",
        outcome: "INFO",
        severity: "INFO",
        documentName: entry.filename,
        pageNumber: getPageForDocument(entry.filename, structuredVision),
        summary:
          entry.status === "PRESENT"
            ? "PDF digital-signature markers were detected; signer and signature validity were not verified."
            : entry.status === "NOT_APPLICABLE"
              ? "Digital-signature marker detection was not applicable to this file type."
              : "No PDF digital-signature markers were detected; visible signatures are not evaluated by this check.",
        evidenceSnippet:
          entry.markers.length > 0
            ? `Detected markers: ${entry.markers.join(", ")}`
            : `status=${entry.status}`,
      }),
    );
  }

  return { findings, structuredVision };
}

export async function generateAuditReport(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:;|$)/i.test(contentType)) {
    return errorResponse("Content-Type must be application/json.", 415);
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return errorResponse("Request body must contain valid JSON.");
    }
    throw error;
  }
  if (!isRecord(body)) {
    return errorResponse("Request body must be a JSON object.");
  }
  if (!Array.isArray(body.structuredVision)) {
    return errorResponse("structuredVision must be an array of extraction results.");
  }
  if (body.structuredVision.length > 200) {
    return errorResponse("structuredVision cannot contain more than 200 results.");
  }

  const components = {};
  for (const name of [
    "tampering",
    "crossDocument",
    "digitalSignatureEvidence",
  ]) {
    components[name] = getComponent(body, name);
    if (!components[name]) {
      return errorResponse(`${name} must be a JSON object or an object with a result property.`);
    }
  }
  for (const name of ["tampering", "digitalSignatureEvidence"]) {
    if (
      typeof components[name].component.filename !== "string" ||
      !components[name].component.filename.trim()
    ) {
      return errorResponse(`${name}.filename must identify the source document.`);
    }
  }
  if (
    body.structuredVision.some(
      (entry) =>
        !isRecord(entry) ||
        typeof entry.filename !== "string" ||
        !entry.filename.trim(),
    )
  ) {
    return errorResponse(
      "Every structuredVision entry must include a source document filename.",
    );
  }
  const normalized = collectFindings(body, components);
  if (normalized.error) return errorResponse(normalized.error);

  const weightedDenominator = normalized.findings.reduce(
    (total, finding) =>
      total + 100 * SOURCE_WEIGHT[finding.sourceModule],
    0,
  );
  const weightedNumerator = normalized.findings.reduce(
    (total, finding) =>
      total +
      finding.severityScore *
        SOURCE_WEIGHT[finding.sourceModule] *
        (finding.outcome === "FAILED" || finding.outcome === "REVIEW" ? 1 : 0),
    0,
  );
  const weightedSeverityScore =
    weightedDenominator === 0
      ? 0
      : Number(((weightedNumerator / weightedDenominator) * 100).toFixed(2));

  const hasCritical = normalized.findings.some(
    (finding) =>
      finding.outcome === "FAILED" && finding.severity === "CRITICAL",
  );
  const hasReview = normalized.findings.some(
    (finding) => finding.outcome === "REVIEW",
  );
  const hasViolation = normalized.findings.some(
    (finding) => finding.outcome === "FAILED",
  );
  const recommendation =
    hasCritical || weightedSeverityScore >= 50
      ? "REJECT_WITH_DEFICIENCY"
      : hasReview
        ? "FLAG_FOR_MANUAL_INSPECTION"
        : hasViolation
          ? "REJECT_WITH_DEFICIENCY"
          : "APPROVE";

  const findings = normalized.findings.map((finding) => ({
    ...finding,
    sourceWeight: SOURCE_WEIGHT[finding.sourceModule],
  }));
  return Response.json({
    schemaVersion: "1.0",
    reportId: randomUUID(),
    generatedAt: new Date().toISOString(),
    recommendation,
    weightedSeverityScore,
    decisionBasis: {
      severityPoints: SEVERITY_SCORE,
      sourceWeights: SOURCE_WEIGHT,
      weightedScoreMethod:
        "100 × (weighted FAILED and REVIEW severity points ÷ weighted maximum severity points for all dossier checks).",
      weightedScoreRejectThreshold: 50,
      rules: [
        "Any CRITICAL failed finding or weighted severity score of 50 or more results in REJECT_WITH_DEFICIENCY.",
        "Otherwise, any REVIEW finding results in FLAG_FOR_MANUAL_INSPECTION.",
        "Otherwise, any failed finding results in REJECT_WITH_DEFICIENCY; no failed or review findings results in APPROVE.",
      ],
    },
    checksSummary: {
      total: findings.length,
      passed: findings.filter((finding) => finding.outcome === "PASSED").length,
      failed: findings.filter((finding) => finding.outcome === "FAILED").length,
      requiringReview: findings.filter((finding) => finding.outcome === "REVIEW")
        .length,
      informational: findings.filter((finding) => finding.outcome === "INFO")
        .length,
    },
    sourceResults: {
      tampering: components.tampering.result,
      structuredVision: body.structuredVision,
      crossDocument: components.crossDocument.result,
      digitalSignatureEvidence: components.digitalSignatureEvidence.result,
    },
    evidenceDossier: findings,
    administrativeReview: {
      required: true,
      requiredRole: "AICTE_AUTHORIZED_OFFICIAL",
      status: "PENDING_FINAL_SIGN_OFF",
      finalSignOff: null,
      override: {
        allowed: true,
        status: "NOT_OVERRIDDEN",
        reason: null,
      },
    },
  });
}
