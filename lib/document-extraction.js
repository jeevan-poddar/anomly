import { gemini } from "./gemini.js";

const EXTRACTION_PROMPT = `Act as an expert regulatory document parser specializing in AICTE approvals and university affiliation documents. Carefully read the supplied document, including tables, stamps, and handwritten or scanned text when legible. Extract only facts explicitly present in the document; do not infer missing values. Return exactly one valid JSON object with no markdown, code fences, or text outside the JSON. Use exactly these keys and types:
{
  "institution_name": "string; use an empty string if not found",
  "trust_name": "string; use an empty string if not found",
  "registration_number": "string; use an empty string if not found",
  "director_names": ["array of director names explicitly listed; use an empty array if none are found"],
  "document_type": "string describing the document, such as Affiliation or Fire Safety NOC; use an empty string if unclear",
  "issue_date": "string as printed, or an empty string if not found",
  "expiry_date": "string as printed, or N/A if not applicable or not found",
  "sanctioned_intake": "integer or null if not found",
  "required_faculty": "integer or null if not found",
  "roster_type": "faculty, student, other, or an empty string if this is not a roster or its type is unclear",
  "roster_count": "integer count of distinct roster entries actually listed, or null if not a roster or not countable",
  "signatures": ["array of signer roles or names for signatures visibly completed on the document; use an empty array if none are found"],
  "qr_code_present": "boolean; true only when a QR code is visibly present on the document, otherwise false",
  "extracted_metrics": "an object of other useful counts, ratios, dates, and text facts; use strings or numbers as values, and an empty object if none"
}
Count roster rows only when they represent distinct listed people, not a stated sanctioned or required total. Do not infer missing signatures, people, or values. Preserve the document's stated units and context in extracted_metrics.`;

export function detectDocumentMimeType(buffer) {
  if (buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return "application/pdf";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  return null;
}

function normalizeExtraction(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gemini returned a JSON value that is not an object.");
  }

  const {
    institution_name,
    trust_name,
    registration_number,
    director_names,
    document_type,
    issue_date,
    expiry_date,
    sanctioned_intake,
    required_faculty,
    roster_type,
    roster_count,
    signatures,
    qr_code_present,
    extracted_metrics,
  } = value;

  if (
    typeof institution_name !== "string" ||
    typeof trust_name !== "string" ||
    typeof registration_number !== "string" ||
    !Array.isArray(director_names) ||
    director_names.some((name) => typeof name !== "string") ||
    typeof document_type !== "string" ||
    typeof issue_date !== "string" ||
    typeof expiry_date !== "string" ||
    typeof roster_type !== "string" ||
    (roster_count !== null &&
      (!Number.isInteger(roster_count) || roster_count < 0)) ||
    !Array.isArray(signatures) ||
    signatures.some((signature) => typeof signature !== "string") ||
    typeof qr_code_present !== "boolean" ||
    (sanctioned_intake !== null &&
      (!Number.isInteger(sanctioned_intake) || sanctioned_intake < 0)) ||
    (required_faculty !== null &&
      (!Number.isInteger(required_faculty) || required_faculty < 0)) ||
    extracted_metrics === null ||
    typeof extracted_metrics !== "object" ||
    Array.isArray(extracted_metrics) ||
    Object.values(extracted_metrics).some(
      (metric) =>
        metric !== null &&
        !["string", "number", "boolean"].includes(typeof metric),
    )
  ) {
    throw new Error("Gemini returned data that does not match the extraction schema.");
  }

  return {
    institution_name,
    trust_name,
    registration_number,
    director_names,
    document_type,
    issue_date,
    expiry_date,
    sanctioned_intake,
    required_faculty,
    roster_type,
    roster_count,
    signatures,
    qr_code_present,
    extracted_metrics,
  };
}

export async function extractDocument(buffer, mimeType) {
  const detectedMimeType = detectDocumentMimeType(buffer);
  if (!detectedMimeType) {
    throw new TypeError("The uploaded bytes are not a supported PDF, PNG, or JPEG file.");
  }
  if (detectedMimeType !== mimeType) {
    throw new TypeError("The declared file type does not match the uploaded file bytes.");
  }

  const generatedText = await gemini({ buffer, mimeType }, EXTRACTION_PROMPT);
  return normalizeExtraction(JSON.parse(generatedText));
}
