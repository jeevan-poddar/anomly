import { randomUUID } from "node:crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

function errorResponse(error, status, details) {
  return Response.json(
    { error, ...(details ? { details } : {}) },
    { status },
  );
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

  let metadata = {};
  const metadataField = formData.get("metadata");

  if (metadataField !== null) {
    if (typeof metadataField !== "string") {
      return errorResponse("The metadata field must contain a JSON object.", 400);
    }

    try {
      const parsedMetadata = JSON.parse(metadataField);
      if (
        parsedMetadata === null ||
        typeof parsedMetadata !== "object" ||
        Array.isArray(parsedMetadata)
      ) {
        return errorResponse("The metadata field must contain a JSON object.", 400);
      }
      metadata = { ...parsedMetadata };
    } catch (error) {
      if (error instanceof SyntaxError) {
        return errorResponse("The metadata field must contain valid JSON.", 400);
      }
      throw error;
    }
  }

  for (const field of ["institutionName", "applicationType"]) {
    const value = formData.get(field);
    if (value !== null) {
      if (typeof value !== "string") {
        return errorResponse(`The ${field} field must be text.`, 400);
      }
      metadata[field] = value;
    }
  }

  const uploads = formData.getAll("documents");
  if (uploads.length === 0) {
    return errorResponse("At least one file is required in the documents field.", 400);
  }

  const invalidFiles = [];
  const files = [];

  for (const upload of uploads) {
    if (typeof upload === "string") {
      invalidFiles.push({
        filename: "(unknown)",
        reason: "The documents field must contain uploaded files.",
      });
      continue;
    }

    const reasons = [];
    if (!ALLOWED_MIME_TYPES.has(upload.type)) {
      reasons.push(
        `MIME type "${upload.type || "(empty)"}" is not allowed. Allowed types: ${[
          ...ALLOWED_MIME_TYPES,
        ].join(", ")}.`,
      );
    }
    if (upload.size > MAX_FILE_SIZE) {
      reasons.push("File exceeds the 10 MB size limit.");
    }

    if (reasons.length > 0) {
      invalidFiles.push({ filename: upload.name, reason: reasons.join(" ") });
    } else {
      files.push(upload);
    }
  }

  if (invalidFiles.length > 0) {
    return errorResponse("One or more files failed validation.", 400, invalidFiles);
  }

  const bufferedFiles = await Promise.all(
    files.map(async (file) => ({
      file,
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );

  const ingestedFiles = bufferedFiles.map(({ file, buffer }) => ({
    trackingId: randomUUID(),
    filename: file.name,
    size: buffer.length,
    mimeType: file.type,
  }));

  return Response.json({
    success: true,
    sessionId: randomUUID(),
    metadata,
    files: ingestedFiles,
  });
}
