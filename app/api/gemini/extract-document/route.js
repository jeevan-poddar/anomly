import {
  GeminiConfigurationError,
} from "../../../../lib/gemini.js";
import {
  detectDocumentMimeType,
  extractDocument,
} from "../../../../lib/document-extraction.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);
const MIME_TYPE_BY_EXTENSION = new Map([
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

function errorResponse(error, status) {
  return Response.json({ error }, { status });
}

function inferMimeType(filename) {
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  return extension ? MIME_TYPE_BY_EXTENSION.get(extension) : undefined;
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

  const uploads = [
    ...formData.getAll("file"),
    ...formData.getAll("document"),
    ...formData.getAll("documents"),
  ];
  if (uploads.length !== 1 || typeof uploads[0] === "string") {
    return errorResponse("Upload exactly one file using the file field.", 400);
  }

  const upload = uploads[0];
  if (upload.size === 0) {
    return errorResponse("The uploaded file is empty.", 400);
  }
  if (upload.size > MAX_FILE_SIZE) {
    return errorResponse("The uploaded file exceeds the 10 MB size limit.", 400);
  }

  const inferredMimeType = inferMimeType(upload.name);
  const declaredMimeType =
    ALLOWED_MIME_TYPES.has(upload.type)
      ? upload.type
      : !upload.type || upload.type === "application/octet-stream"
        ? inferredMimeType
        : undefined;
  const buffer = Buffer.from(await upload.arrayBuffer());
  if (buffer.length === 0) {
    return errorResponse("The uploaded file is empty.", 400);
  }
  const mimeType = detectDocumentMimeType(buffer);
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return errorResponse("The uploaded bytes are not a supported PDF, PNG, or JPEG file.", 415);
  }
  if (declaredMimeType && declaredMimeType !== mimeType) {
    return errorResponse("The declared file type does not match the uploaded file bytes.", 400);
  }

  try {
    return Response.json(await extractDocument(buffer, mimeType));
  } catch (error) {
    if (error instanceof GeminiConfigurationError) {
      console.error("Document extraction is not configured:", error.message);
      return errorResponse("Document extraction is not configured.", 500);
    }

    console.error("Document extraction failed:", error);
    return errorResponse("Unable to extract structured document data.", 502);
  }
}
