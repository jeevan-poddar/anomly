"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const decisionActions = [
  {
    verdict: "APPROVE",
    label: "Approve",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  },
  {
    verdict: "ISSUE_DEFICIENCY_NOTICE",
    label: "Issue Deficiency Notice",
    tone: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
  },
  {
    verdict: "REJECT",
    label: "Reject",
    tone: "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
  },
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (!value.length) return "None";
    return value
      .map((item) => displayValue(item))
      .filter((item) => item !== "Not provided" && item !== "None")
      .join("\n");
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(
      ([, item]) => item !== null && item !== undefined && item !== "",
    );
    if (!entries.length) return "None";
    return entries
      .map(([key, item]) => `${humanize(key)}: ${displayValue(item)}`)
      .join("\n");
  }
  return String(value);
}

function humanize(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? displayValue(value)
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function getTone(value) {
  const status = String(value ?? "").toUpperCase();
  if (["MATCH", "VERIFIED"].includes(status)) return "verified";
  if (["MISMATCH", "FLAGGED", "FAILED"].includes(status)) return "flagged";
  if (
    status.includes("REJECT") ||
    status.includes("DEFICIENCY") ||
    status.includes("MANUAL") ||
    status.startsWith("FLAG_")
  ) {
    return "flagged";
  }
  if (
    ["VERIFIED", "PASSED", "APPROVED", "CLEAN", "SUCCESS", "NO ISSUE"].some(
      (state) => status.includes(state),
    ) || status.includes("APPROVE") || status === "FOUND"
  ) {
    return "verified";
  }
  if (
    ["FAILED", "FLAGGED", "REJECTED", "INVALID", "DEFICIENT", "CRITICAL", "ISSUE", "ERROR"].some(
      (state) => status.includes(state),
    )
  ) {
    return "flagged";
  }
  return "default";
}

function recommendationCopy(value) {
  switch (String(value ?? "").toUpperCase()) {
    case "APPROVE":
      return {
        title: "No automated issues found",
        description:
          "The available automated checks passed. An authorized official must still review the evidence and record the final decision.",
      };
    case "FLAG_FOR_MANUAL_INSPECTION":
      return {
        title: "Manual review recommended",
        description:
          "Some results could not be confirmed automatically. Please review the source documents and evidence before deciding.",
      };
    case "REJECT_WITH_DEFICIENCY":
      return {
        title: "Issues need attention",
        description:
          "Automated checks found possible discrepancies or deficiencies. Review the evidence and resolve them before making a final decision.",
      };
    default:
      return {
        title: "Review the audit results",
        description:
          "Use the evidence below to guide the review. The recommendation is not a substitute for an authorized official's decision.",
      };
  }
}

function recommendationLabel(value) {
  const labels = {
    APPROVE: "Approval recommended",
    FLAG_FOR_MANUAL_INSPECTION: "Manual review recommended",
    REJECT_WITH_DEFICIENCY: "Deficiencies found",
  };
  return labels[String(value ?? "").toUpperCase()] ?? humanize(value ?? "Pending");
}

function StatusPill({ children, tone }) {
  const classes =
    tone === "verified"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : tone === "flagged"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-gray-200 bg-gray-50 text-gray-700";

  return (
    <span className={`inline-flex items-center border px-2.5 py-1 text-xs font-medium ${classes}`}>
      {children}
    </span>
  );
}

function CheckSummary({ label, status, message }) {
  return (
    <div className="border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-gray-900">{label}</h3>
        <StatusPill tone={getTone(status)}>{status}</StatusPill>
      </div>
      <p className="mt-3 text-sm text-gray-700">{message}</p>
    </div>
  );
}

function DigitalSignatureSummary({ result }) {
  const evidence = result?.evidence?.digitalSignature;
  if (evidence?.status === "PRESENT") {
    return (
      <CheckSummary
        label="Digital Signature Markers"
        status="Detected"
        message="PDF signature markers were detected. Signature validity and signer identity were not verified."
      />
    );
  }
  if (evidence?.status === "NOT_DETECTED") {
    return (
      <CheckSummary
        label="Digital Signature Markers"
        status="Not Detected"
        message="No PDF signature markers were detected; this does not evaluate visible signatures."
      />
    );
  }
  return (
    <CheckSummary
      label="Digital Signature Markers"
      status="Not Applicable"
      message="PDF signature-marker detection applies only to PDF files."
    />
  );
}

function QrSummary({ extraction }) {
  const data = isRecord(extraction?.result) ? extraction.result : extraction;
  if (data?.qr_code_present === true) {
    return <CheckSummary label="QR Code" status="Detected" message="A QR code was detected; its contents were not decoded or verified." />;
  }
  if (data?.qr_code_present === false) {
    return <CheckSummary label="QR Code" status="Not Detected" message="No QR code was detected; this does not prove that none is present." />;
  }
  return <CheckSummary label="QR Code" status="Not Checked" message="QR code checking is not available for this document yet." />;
}

function GeminiForensicReview({ review }) {
  if (!isRecord(review)) {
    return (
      <CheckSummary
        label="Gemini Forensic Review"
        status="Not Available"
        message="No Gemini visual review is available for this document yet."
      />
    );
  }

  const observations = Array.isArray(review.observations)
    ? review.observations.filter(isRecord)
    : [];
  const limitations = Array.isArray(review.limitations)
    ? review.limitations.filter((item) => typeof item === "string")
    : [];

  return (
    <section className="border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-gray-900">Gemini Forensic Review</h4>
        <StatusPill tone="default">
          {humanize(review.tamperingConclusion ?? "Advisory only")}
        </StatusPill>
      </div>
      <p className="mt-3 text-sm text-gray-700">
        {typeof review.summary === "string"
          ? review.summary
          : "No visual review summary is available."}
      </p>
      <h5 className="mt-4 text-sm font-medium text-gray-900">Observations</h5>
      {observations.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-gray-700">
          {observations.map((observation, index) => (
            <li
              key={`observation-${index}`}
              className="border-l-2 border-gray-300 pl-3"
            >
              {observation.pageNumber
                ? `Page ${observation.pageNumber}: `
                : ""}
              {typeof observation.description === "string"
                ? observation.description
                : "No description provided."}
              {typeof observation.confidence === "string" &&
                ` (Confidence: ${observation.confidence})`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-gray-600">
          No specific visual anomalies were reported.
        </p>
      )}
      {limitations.length > 0 && (
        <>
          <h5 className="mt-4 text-sm font-medium text-gray-900">Limitations</h5>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {limitations.map((limitation, index) => (
              <li key={`limitation-${index}`}>{limitation}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ReconciliationLog({ log }) {
  if (!isRecord(log)) {
    return (
      <p className="border border-gray-200 bg-white p-3 text-sm text-gray-700">
        {displayValue(log)}
      </p>
    );
  }

  const details = [
    ["Run", log.run_id],
    ["Status", log.status],
    ["Completed", formatDate(log.generated_at ?? log.generatedAt)],
    ["Documents checked", log.documents_checked ?? log.documentsChecked],
    ["Findings", log.total_flags ?? log.totalFlags],
    ["Critical", log.critical_flags ?? log.criticalFlags],
    ["Warnings", log.warning_flags ?? log.warningFlags],
    ["Confidence", typeof (log.confidence_score ?? log.confidenceScore) === "number" ? `${Math.round((log.confidence_score ?? log.confidenceScore) * 100)}%` : null],
    ["Recommendation", log.recommendation ? recommendationLabel(log.recommendation) : null],
    ["Weighted severity", typeof (log.weighted_severity_score ?? log.weightedSeverityScore) === "number" ? `${log.weighted_severity_score ?? log.weightedSeverityScore}%` : null],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const flagCodes = Array.isArray(log.flag_codes ?? log.flagCodes)
    ? log.flag_codes ?? log.flagCodes
    : [];

  return (
    <article className="border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-medium text-gray-900">Reconciliation run</h4>
        <StatusPill tone={getTone(log.status)}>{humanize(log.status ?? "completed")}</StatusPill>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
            <dd className="mt-1 break-words text-sm text-gray-700">{displayValue(value)}</dd>
          </div>
        ))}
      </dl>
      {flagCodes.length > 0 && (
        <p className="mt-3 text-sm text-gray-700">
          <span className="font-medium">Checks flagged:</span>{" "}
          {flagCodes.map(humanize).join(", ")}
        </p>
      )}
    </article>
  );
}

function AuditFinding({ finding }) {
  const document = finding.document?.name;
  const pageNumber = finding.document?.pageNumber;

  return (
    <article className="border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {humanize(finding.sourceModule)} · {humanize(finding.checkCode)}
          </p>
          <h3 className="mt-1 font-semibold text-gray-900">
            {finding.evidence?.summary ?? discrepancyTitle(finding)}
          </h3>
        </div>
        <StatusPill tone={getTone(finding.outcome ?? finding.severity)}>
          {humanize(finding.outcome ?? finding.severity)}
        </StatusPill>
      </div>
      {finding.evidence?.snippet && (
        <p className="mt-2 whitespace-pre-line break-words text-sm text-gray-700">
          {finding.evidence.snippet}
        </p>
      )}
      {(document || pageNumber) && (
        <p className="mt-3 text-xs text-gray-600">
          {document ?? "Dossier-wide check"}{pageNumber ? ` · Page ${pageNumber}` : ""}
        </p>
      )}
    </article>
  );
}

function extractionEntries(extraction) {
  if (!isRecord(extraction)) return [];
  const result = isRecord(extraction.result) ? extraction.result : extraction;
  return Object.entries(result).filter(
    ([key, value]) =>
      !["filename", "pageNumber", "result", "qr_code_present"].includes(key) &&
      value !== null &&
      value !== undefined &&
      value !== "",
  );
}

function discrepancyTitle(item) {
  if (!isRecord(item)) return displayValue(item);
  return (
    item.title ??
    item.message ??
    item.summary ??
    item.evidence?.summary ??
    item.field_name ??
    item.code ??
    "Audit finding"
  );
}

function discrepancyDetails(item) {
  if (!isRecord(item)) return "";
  if (typeof item.details?.explanation === "string") {
    return item.details.explanation;
  }
  if (Array.isArray(item.details?.values)) {
    return "";
  }
  return displayValue(
    item.snippet ??
      item.evidence?.snippet ??
      item.description ??
      item.details ??
      item.evidence ??
      "",
  );
}

function FieldCheck({ check }) {
  const statusLabel = {
    MATCH: "Consistent",
    MISMATCH: "Needs review",
    INSUFFICIENT_EVIDENCE: "Not enough sources",
  }[check.status] ?? humanize(check.status);

  return (
    <article className="border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-medium text-gray-900">{check.label ?? humanize(check.field)}</h3>
        <StatusPill tone={getTone(check.status)}>{statusLabel}</StatusPill>
      </div>
      {Array.isArray(check.values) && check.values.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {check.values.map((entry, index) => (
            <li
              key={`${entry.source ?? "source"}-${index}`}
              className="flex flex-col gap-1 border-l-2 border-gray-200 pl-3 sm:flex-row sm:justify-between sm:gap-4"
            >
              <span className="break-words text-sm text-gray-800">{displayValue(entry.value)}</span>
              <span className="shrink-0 text-xs text-gray-500">{displayValue(entry.source)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-gray-600">
          This field was not available from enough sources to compare.
        </p>
      )}
      {check.status === "INSUFFICIENT_EVIDENCE" && (
        <p className="mt-2 text-xs text-gray-500">
          A single source is shown for reference; it is not treated as a confirmed match.
        </p>
      )}
    </article>
  );
}

function InstitutionDetails({ institution }) {
  const details = [
    ["Trust", institution.trustName],
    ["Trust Type", institution.trustType],
    ["Registration Number", institution.registrationNumber],
    ["Registration Date", formatDate(institution.registrationDate)],
    ["Program", [institution.programLevel, institution.courseName].filter(Boolean).join(" · ")],
    ["Requested Intake", institution.requestedIntake],
    ["Proposed Faculty", institution.proposedFaculty],
    ["Land Area (acres)", institution.landAreaAcres],
    ["Land Ownership", institution.landOwnershipType],
    ["Instructional Area (sqm)", institution.instructionalAreaSqm],
    ["Building Approval Authority", institution.buildingApprovalAuthority],
    ["Campus Address", [institution.campusAddress, institution.district, institution.state, institution.pincode].filter(Boolean).join(", ")],
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {details.map(([label, value]) => (
        <div key={label} className="border border-gray-200 bg-white p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {label}
          </dt>
          <dd className="mt-2 whitespace-pre-line break-words text-sm font-medium text-gray-900">
            {displayValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function completeApplicationForm(institution, documents) {
  const formFields = {
    "Sponsoring Body Type": institution.trustType,
    "Name of Trust/Society/Company": institution.trustName,
    "Registration Number": institution.registrationNumber,
    "Registration Date": formatDate(institution.registrationDate),
    "Chairman/President Name": institution.chairmanName,
    "Chairman Mobile": institution.chairmanMobile,
    "Chairman Email": institution.chairmanEmail,
    "Proposed Institution Name": institution.institutionName,
    "Category of Institution": institution.institutionCategory,
    State: institution.state,
    District: institution.district,
    "Full Campus Address": institution.campusAddress,
    Pincode: institution.pincode,
    "Nearest Railway Station": institution.railwayStation,
    "Distance (km)": institution.railwayDistance,
    "Total Land Area (in Acres)": institution.landAreaAcres,
    "Land Ownership Type": institution.landOwnershipType,
    "Survey / Khata / Plot Numbers": institution.surveyNumbers,
    "Total Instructional Built-Up Area (sq. meters)":
      institution.instructionalAreaSqm,
    "Building Plan Approval Authority": institution.buildingApprovalAuthority,
    "Program Level": institution.programLevel,
    "Course / Specialization Name": institution.courseName,
    "Requested Sanctioned Intake": institution.requestedIntake,
    "Proposed Faculty Count": institution.proposedFaculty,
    "Trust PAN Number": institution.trustPan,
    "Trust Bank Name": institution.bankName,
    "Trust Bank Account Number": institution.bankAccountNumber,
    "IFSC Code": institution.ifscCode,
    "Pledged Reserve / Corpus Fund Amount (INR)": institution.corpusFundAmount,
  };
  const documentLabels = {
    trustDeed: "Trust Registration Deed",
    landDocuments: "Land Ownership / Sale Deed",
    buildingPlan: "Approved Building Plan",
    fireNoc: "Fire Safety No Objection Certificate (NOC)",
  };

  for (const document of documents) {
    const label =
      documentLabels[document.documentType] ??
      humanize(document.documentType);
    formFields[`${label} File`] = document.name;
  }

  return formFields;
}

function DocumentViewer({
  open,
  title,
  documentUrl,
  formData,
  previewError,
  onClose,
}) {
  if (!open) return null;

  const hasDocumentUrl = Boolean(documentUrl);
  const isPdf = hasDocumentUrl && /\.pdf(?:$|[?#])/i.test(documentUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-6xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="max-h-[75vh] overflow-auto p-4">
          {hasDocumentUrl ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded border border-gray-200 bg-gray-50">
                {isPdf ? (
                  <iframe
                    title={title}
                    src={documentUrl}
                    className="h-[70vh] min-h-[420px] w-full bg-white"
                  />
                ) : (
                  <img
                    src={documentUrl}
                    alt={title}
                    className="mx-auto max-h-[70vh] w-full object-contain"
                  />
                )}
              </div>
              <a
                href={documentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open document in new tab
              </a>
            </div>
          ) : isRecord(formData) ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {Object.entries(formData).map(([label, value]) => (
                <div
                  key={label}
                  className="border border-gray-200 bg-white p-4"
                >
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {label}
                  </dt>
                  <dd className="mt-2 whitespace-pre-line break-words text-sm text-gray-900">
                    {displayValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="rounded border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-700">
              {previewError || "The uploaded document preview is unavailable."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditDossierContent() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [dossier, setDossier] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    if (!id) return undefined;
    const controller = new AbortController();

    async function loadDossier() {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/audit/${encodeURIComponent(id)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Unable to load the audit dossier.");
        }
        if (!isRecord(result.dossier) || !isRecord(result.dossier.institution)) {
          throw new Error("The audit dossier response was invalid.");
        }
        setDossier(result.dossier);
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(loadError.message || "Unable to load the audit dossier.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadDossier();
    return () => controller.abort();
  }, [id, reloadKey]);

  async function submitDecision(verdict) {
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/audit/${encodeURIComponent(id)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verdict, notes: reviewNotes }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to save the review decision.");
      }
      setDossier((current) => ({
        ...current,
        institution: { ...current.institution, status: result.status },
        reviewDecision: {
          verdict: result.verdict,
          notes: reviewNotes.trim(),
          reviewedAt: result.reviewedAt,
        },
      }));
      setNotice(`Decision recorded: ${humanize(verdict)}.`);
    } catch (decisionError) {
      setError(decisionError.message || "Unable to save the review decision.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRunTest() {
    setIsRunningTest(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/audit/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: institution.id }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || "Unable to run the audit test.");
      }
      if (
        !Number.isInteger(result.processedDocuments) ||
        !isRecord(result.reconciliation) ||
        !isRecord(result.report) ||
        !Array.isArray(result.geminiReviews)
      ) {
        throw new Error("The audit test response was invalid.");
      }
      setDossier((current) =>
        current
          ? {
              ...current,
              documents: current.documents.map((document) => {
                const geminiReview = result.geminiReviews.find(
                  (item) =>
                    isRecord(item) && item.documentId === document.id,
                );
                return geminiReview && isRecord(geminiReview.review)
                  ? { ...document, geminiForensics: geminiReview.review }
                  : document;
              }),
              auditReport: result.report,
              reconciliation: result.reconciliation,
              discrepancies: Array.isArray(result.reconciliation.flags)
                ? result.reconciliation.flags
                : current.discrepancies,
            }
          : current,
      );
      setNotice(
        `Audit test completed for ${result.processedDocuments} document${result.processedDocuments === 1 ? "" : "s"}.`,
      );
      setReloadKey((key) => key + 1);
    } catch (testError) {
      setError(testError.message || "Unable to run the audit test.");
    } finally {
      setIsRunningTest(false);
    }
  }

  const institution = dossier?.institution;
  const discrepancies = Array.isArray(dossier?.discrepancies)
    ? dossier.discrepancies
    : [];
  const reconciliationLogs = Array.isArray(dossier?.reconciliationLogs)
    ? dossier.reconciliationLogs
    : dossier?.reconciliationLogs
      ? [dossier.reconciliationLogs]
      : [];
  const fieldChecks = Array.isArray(dossier?.reconciliation?.fieldChecks)
    ? dossier.reconciliation.fieldChecks
    : [];
  const matchedFields = fieldChecks.filter((check) => check.status === "MATCH").length;
  const fieldsNeedingReview = fieldChecks.filter((check) => check.status === "MISMATCH").length;

  return (
    <main className="min-h-screen bg-white pb-40 text-gray-900">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-600">
          <Link href="/admin/dashboard" className="text-gray-700 hover:text-gray-900">
            Admin Dashboard
          </Link>
          <span aria-hidden="true" className="px-2">/</span>
          <span className="text-gray-500">Institution Audit</span>
        </nav>

        {isLoading && (
          <div role="status" className="border border-gray-200 bg-white p-6 text-sm text-gray-600">
            Loading institutional audit dossier…
          </div>
        )}

        {!isLoading && error && !dossier && (
          <div role="alert" className="border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="mt-3 border border-amber-400 bg-white px-3 py-2 font-medium hover:bg-amber-100"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && institution && (
          <>
            <header className="space-y-5 border border-gray-200 bg-white p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                    Institutional Audit Dossier
                  </p>
                  <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                    {institution.institutionName}
                  </h1>
                  <p className="text-sm text-gray-600">
                    {institution.id} · {[institution.state, institution.district].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-3 border border-gray-200 bg-white p-4">
                  <span className="text-sm font-medium text-gray-700">Application Status</span>
                  <StatusPill tone={getTone(institution.status)}>
                    {humanize(institution.status ?? "PENDING_REVIEW")}
                  </StatusPill>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border border-gray-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Submitted</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">{formatDate(institution.submittedAt)}</p>
                </div>
                {dossier.reviewDecision && (
                  <div className="border border-emerald-300 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                      Latest Reviewer Decision
                    </p>
                    <p className="mt-2 text-sm font-medium text-emerald-900">
                      {humanize(dossier.reviewDecision.verdict)} · {formatDate(dossier.reviewDecision.reviewedAt)}
                    </p>
                    {dossier.reviewDecision.notes && (
                      <p className="mt-1 text-sm text-emerald-900">{dossier.reviewDecision.notes}</p>
                    )}
                  </div>
                )}
              </div>
            </header>

            <section aria-label="Institution profile" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Institution Profile</h2>
                <button
                  type="button"
                  onClick={() =>
                    setViewer({
                      title: `${institution.institutionName} form view`,
                      formData: completeApplicationForm(
                        institution,
                        dossier.documents ?? [],
                      ),
                    })
                  }
                  className="border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  View Complete Form
                </button>
              </div>
              <InstitutionDetails institution={institution} />
            </section>

            <section className="space-y-4 border border-gray-200 bg-white p-5">
              <div>
                <h2 className="text-xl font-semibold">Document Verification</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Forensic, QR-code detection, and OCR results from the stored document records.
                </p>
              </div>
              {dossier.documents?.length ? (
                <div className="space-y-4">
                  {dossier.documents.map((document) => (
                    <article key={document.id} className="space-y-3 border border-gray-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">{document.name}</h3>
                          <p className="mt-1 text-xs text-gray-500">{humanize(document.documentType)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setViewer({
                                title: `${document.name} document`,
                                documentUrl: document.documentUrl,
                                previewError: document.documentPreviewError,
                              })
                            }
                            className="border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            View Document
                          </button>
                        </div>
                      </div>
                      <GeminiForensicReview review={document.geminiForensics} />
                      <div className="grid gap-3 lg:grid-cols-2">
                        <DigitalSignatureSummary result={document.forensics} />
                        <QrSummary extraction={document.extraction} />
                      </div>
                      <div className="border border-gray-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-medium text-gray-900">OCR Extractions</h4>
                          <StatusPill tone={getTone(document.extractionStatus)}>
                            {humanize(document.extractionStatus)}
                          </StatusPill>
                        </div>
                        {extractionEntries(document.extraction).length > 0 ? (
                          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                            {extractionEntries(document.extraction).map(([key, value]) => (
                              <div key={key}>
                                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{humanize(key)}</dt>
                                <dd className="mt-1 whitespace-pre-line break-words text-sm text-gray-700">{displayValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="mt-2 text-sm text-gray-600">No OCR extraction is available yet.</p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="border border-gray-200 bg-white p-4 text-sm text-gray-600">
                  No application documents are recorded for this institution.
                </p>
              )}
            </section>

            <section className="space-y-4 border border-gray-200 bg-white p-5">
              <div>
                <h2 className="text-xl font-semibold">Cross-checks & Discrepancies</h2>
                <p className="mt-1 text-sm text-gray-600">
                  OCR values are compared across relevant documents and against the submitted application. Dates and document-specific details are not treated as conflicts just because they differ.
                </p>
              </div>
              {fieldChecks.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium text-gray-900">Field-by-field verification</h3>
                    <p className="text-sm text-gray-600">
                      {matchedFields} consistent · {fieldsNeedingReview} needing review
                    </p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {fieldChecks.map((check, index) => (
                      <FieldCheck key={`${check.field ?? "field"}-${index}`} check={check} />
                    ))}
                  </div>
                </div>
              )}
              {discrepancies.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="font-medium text-gray-900">Items to review</h3>
                  {discrepancies.map((item, index) => (
                    <article
                      key={`${item.id ?? item.code ?? "discrepancy"}-${index}`}
                      className="border border-amber-300 bg-amber-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{discrepancyTitle(item)}</h3>
                          {discrepancyDetails(item) && (
                            <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{discrepancyDetails(item)}</p>
                          )}
                          {Array.isArray(item?.details?.values) && (
                            <ul className="mt-3 space-y-2">
                              {item.details.values.map((entry, valueIndex) => (
                                <li
                                  key={`${entry.source ?? entry.filename ?? "source"}-${valueIndex}`}
                                  className="flex flex-col gap-1 border-l-2 border-amber-400 pl-3 sm:flex-row sm:justify-between sm:gap-4"
                                >
                                  <span className="break-words text-sm text-gray-800">
                                    {displayValue(entry.value)}
                                  </span>
                                  <span className="shrink-0 text-xs text-gray-600">
                                    {displayValue(entry.source ?? entry.filename)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {isRecord(item) && (item.severity_level ?? item.severity) && (
                          <StatusPill tone={getTone(item.severity_level ?? item.severity)}>
                            {humanize(item.severity_level ?? item.severity)}
                          </StatusPill>
                        )}
                      </div>
                      {isRecord(item) && item.source_document && (
                        <p className="mt-2 text-xs text-gray-600">Source: {displayValue(item.source_document)}</p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="border border-gray-200 bg-white p-4 text-sm text-gray-600">
                  No discrepancies have been recorded.
                </p>
              )}
              {fieldChecks.length === 0 && discrepancies.length === 0 && (
                <p className="border border-gray-200 bg-white p-4 text-sm text-gray-600">
                  Run the audit checks to compare extracted values. A field can only be confirmed when enough sources contain it.
                </p>
              )}
              {reconciliationLogs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900">Reconciliation Logs</h3>
                  {reconciliationLogs.map((log, index) => (
                    <ReconciliationLog key={log?.run_id ?? log?.generated_at ?? index} log={log} />
                  ))}
                </div>
              )}
            </section>

            {isRecord(dossier.auditReport) && (
              <section
                aria-label="Audit recommendation"
                className="space-y-3 border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Audit Recommendation</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Generated {formatDate(dossier.auditReport.generatedAt)}
                    </p>
                  </div>
                  <StatusPill tone={getTone(dossier.auditReport.recommendation)}>
                    {recommendationLabel(dossier.auditReport.recommendation)}
                  </StatusPill>
                </div>
                <div className="border border-gray-200 bg-gray-50 p-4">
                  <h3 className="font-semibold text-gray-900">
                    {recommendationCopy(dossier.auditReport.recommendation).title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-gray-700">
                    {recommendationCopy(dossier.auditReport.recommendation).description}
                  </p>
                </div>
                {dossier.auditReport.checksSummary && (
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Checks completed", dossier.auditReport.checksSummary.total],
                      ["Passed", dossier.auditReport.checksSummary.passed],
                      ["Issues found", dossier.auditReport.checksSummary.failed],
                      ["Need human review", dossier.auditReport.checksSummary.requiringReview],
                    ].map(([label, value]) => (
                      <div key={label} className="border border-gray-200 bg-white p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900">{value ?? 0}</dd>
                      </div>
                    ))}
                    {typeof dossier.auditReport.weightedSeverityScore === "number" && (
                      <div className="border border-gray-200 bg-white p-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Automated severity score</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900">
                          {dossier.auditReport.weightedSeverityScore}%
                        </dd>
                        <p className="mt-1 text-xs text-gray-500">
                          Higher scores mean more findings need attention.
                        </p>
                      </div>
                    )}
                  </dl>
                )}
                <div className="border border-amber-200 bg-amber-50 p-4">
                  <p className="font-medium text-amber-950">
                    {dossier.auditReport.administrativeReview?.status === "PENDING_FINAL_SIGN_OFF"
                      ? "Final sign-off is still pending"
                      : "Final sign-off status"}
                  </p>
                  <p className="mt-1 text-sm text-amber-900">
                    Automated results support the review; an authorized official is responsible for the final decision.
                  </p>
                </div>
                {Array.isArray(dossier.auditReport.evidenceDossier) && (
                  <div className="space-y-3 border-t border-gray-200 pt-4">
                    <div>
                      <h3 className="font-medium text-gray-900">Evidence behind this recommendation</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        Each result shows what was checked and the document it came from, when available.
                      </p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {dossier.auditReport.evidenceDossier.map((finding) => (
                        <AuditFinding key={finding.id} finding={finding} />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {notice && (
              <p role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                {notice}
              </p>
            )}
          </>
        )}
      </div>

      <DocumentViewer
        open={Boolean(viewer)}
        title={viewer?.title ?? "Record details"}
        documentUrl={viewer?.documentUrl ?? null}
        formData={viewer?.formData ?? null}
        previewError={viewer?.previewError ?? null}
        onClose={() => setViewer(null)}
      />

      {institution && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            {error && (
              <p role="alert" className="mb-3 text-sm text-amber-900">{error}</p>
            )}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label htmlFor="review-notes" className="mb-2 block text-sm font-medium text-gray-700">
                  Reviewer Notes
                </label>
                <textarea
                  id="review-notes"
                  rows={2}
                  maxLength={5000}
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  className="w-full resize-y border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500"
                  placeholder="Add internal reviewer observations…"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={isRunningTest}
                  onClick={handleRunTest}
                  className="border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRunningTest
                    ? "Running OCR & Gemini Forensic Review..."
                    : "Run Audit Test & Generate Report"}
                </button>
                {decisionActions.map((action) => (
                  <button
                    key={action.verdict}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => submitDecision(action.verdict)}
                    className={`border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${action.tone}`}
                  >
                    {isSubmitting ? "Saving…" : action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function AuditDossierPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white p-8 text-sm text-gray-600">
          Loading institutional audit dossier…
        </main>
      }
    >
      <AuditDossierContent />
    </Suspense>
  );
}
