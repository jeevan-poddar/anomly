This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Gemini API endpoints

The following endpoints use Gemini while retaining the existing deterministic API behavior:

- `POST /api/gemini/forensics-check` accepts one PDF, PNG, or JPEG file in the multipart `file` or `documents` field (up to 10 MB). It returns hash, PDF-structure, editing-signature, duplicate, image, and PDF digital-signature marker checks under `forensics`, plus an advisory Gemini visual review. Signature markers are detection only; this does not verify signature integrity or signer identity.
- `POST /api/gemini/extract-document` accepts one PDF, PNG, or JPEG upload as multipart form data in the `file`, `document`, or `documents` field (up to 10 MB). It returns institution and document details, dates, sanctioned intake, required faculty, and other extracted metrics as JSON.
- `POST /api/gemini/reconcile-documents` accepts OCR results in a `documents` array and an optional `institution` profile. It returns deterministic cross-document reconciliation results with a `geminiReview` advisory summary added. Gemini does not change the reconciliation status, score, or flags.
- `POST /api/gemini/validate-documents` accepts OCR results in a `documents` array, an optional institution profile, and optional academic-session dates. It checks certificate issue and expiry dates deterministically and returns Gemini's advisory review of obvious field type or format concerns.
- `POST /api/gemini/generate-audit-report` accepts the forensic, structured OCR, cross-document, and digital-signature marker results as JSON. It generates the deterministic audit report and adds a Gemini advisory narrative. Gemini does not change the recommendation, score, evidence, or required official sign-off.

All Gemini endpoints require the server-side `GOOGLE_GEMINI_API_KEY`. Uploaded files and the reconciliation or audit evidence sent to these endpoints are processed by Google Gemini using that key. Gemini review and narrative text are advisory and must not replace source-document verification or an authorized official's review.

The admin **Run Audit Test & Generate Report** action calls the Gemini forensics, extraction, reconciliation, document-validation, and audit-report logic directly on the server. Forensics detect digital-signature markers but do not verify signatures cryptographically. QR presence is detected visually during extraction; QR contents are not decoded or issuer-verified. Gemini visual reviews and input-format observations are saved with document results and displayed as advisory; they do not determine the forensic status or the final audit recommendation.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Institutional reconciliation service

Server-side code can import `reconcileInstitution` from `services/reconciliationEngine.js` and pass the Supabase institution row, extracted document metadata, and academic-session dates. Documents may be an array or a MongoDB metadata record with a `files` array; OCR fields can be direct or nested under `extraction`, `metadata`, or `extracted_metadata`. The service returns a stable JSON shape:

```js
{
  discrepancies: [
    {
      field_name: "trust_name",
      source_document: "trust-deed.pdf",
      discrepancy_type: "spelling_discrepancy",
      severity_level: "MEDIUM"
    }
  ],
  health_score: 80,
  recommendation: "FLAG_FOR_DEFICIENCY"
}
```

The default land-area (5 acres) and student-to-faculty (1:20) thresholds match the defaults displayed on the compliance rules page; they are configurable through `rules.minimumLandAreaAcres` and `rules.maximumStudentsPerFaculty` (or `rules.facultyRatio`). `rules.soonToExpireDays` defaults to 90. To enforce a specific instructional-area-per-student standard, supply `rules.minimumInstructionalAreaSqmPerStudent`. The function does not fetch records from Supabase or MongoDB.

The Gemini reconciliation response includes `fieldChecks` with each comparable field's status (`MATCH`, `MISMATCH`, or `INSUFFICIENT_EVIDENCE`) and the value sources, plus discrepancy flags for conflicting values. Institution and trust identity, registration number, intake, faculty, land and instructional area, course, and repeated OCR metrics are cross-checked. Document-specific values such as issue and expiry dates are not treated as cross-document conflicts. Expiry and input-format checks are handled by `/api/gemini/validate-documents`. OCR differences are surfaced for human review, not treated as conclusive proof of an error.

## Audit report

`POST /api/gemini/generate-audit-report` accepts `application/json` containing the prior service outputs:

```json
{
  "tampering": { "filename": "fire-noc.pdf", "result": { "tamper_detected": false, "forensic_score": 0, "flags": [] } },
  "structuredVision": [
    { "filename": "fire-noc.pdf", "pageNumber": 1, "result": { "institution_name": "Example Institute", "document_type": "Fire Safety NOC", "qr_code_present": true } }
  ],
  "crossDocument": { "result": { "status": "APPROVED", "confidence_score": 1, "flags": [] } },
  "digitalSignatureEvidence": { "filename": "fire-noc.pdf", "result": { "documents": [{ "filename": "fire-noc.pdf", "status": "PRESENT", "markers": ["ByteRange"] }] } }
}
```

The `result` wrapper is optional when the service response itself is supplied. Tampering and digital-signature-evidence objects, and every structured-vision entry, must include the source `filename`; extraction entries may also include a one-based `pageNumber`. Findings cite a known page when available and use `null` rather than guessing when page information is not supplied. The response includes a weighted severity score, its scoring weights and decision rules in `decisionBasis`, source results, and an `evidenceDossier` with each pass, informational result, or finding mapped to its originating module, document, page, and evidence snippet. Digital signature markers are reported as information only and are not cryptographically verified. QR presence is visually detected through extraction, but QR contents are not decoded or issuer-verified. Every report requires final sign-off by an authorized AICTE official; the administrative review object exposes the pending sign-off and override state.

## Institutional audit dossier

`GET /api/admin/audit/[id]` returns the institution profile and uploaded document statuses from Supabase, together with matching document metadata, reconciliation findings/logs, and the latest reviewer decision from MongoDB. MongoDB document records are matched by institution id and document metadata; signed upload URLs are not included in the response.

`POST /api/admin/audit/[id]/decision` accepts JSON with a `verdict` of `APPROVE`, `ISSUE_DEFICIENCY_NOTICE`, or `REJECT`, and optional reviewer `notes` (up to 5,000 characters). It updates the institution status to `APPROVED`, `FLAGGED`, or `REJECTED` in Supabase and records the decision in the MongoDB `audit_decisions` collection. These routes use `SUPABASE_SERVICE_ROLE_KEY`, `MONGODB_URI`, and `MONGODB_DATABASE`.

## New institution applications

The form at `/institution/apply-new` submits multipart form data to `POST /api/submit-application`. The route stores institution details and document records in Supabase, uploads the required PDFs to the private `application-documents` Storage bucket, and creates a document metadata record in MongoDB. Configure `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MONGODB_URI`, and `MONGODB_DATABASE` on the server. The setup migration creates the private PDF-only Storage bucket.

For an existing Supabase database, apply `utils/supabase/schema/002_application_form_fields.sql` before deploying the form changes. New databases should use the complete schema in `utils/supabase/schema/001.sql`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# anomly
