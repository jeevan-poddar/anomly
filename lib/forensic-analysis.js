import { createHash } from "node:crypto";
import sharp from "sharp";
import { findAndRecordFingerprint } from "./forensic-fingerprint.js";

const EDITING_SOFTWARE_SIGNATURES = [
  "Adobe Photoshop",
  "Adobe Illustrator",
  "GIMP",
  "PDF Editor",
  "Infix",
  "Foxit PhantomPDF",
  "Nitro PDF",
  "Wondershare PDFelement",
  "PDF-XChange",
  "Sejda",
  "Smallpdf",
  "Canva",
];

function configuredHashes(name) {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((hash) => hash.trim().toLowerCase())
      .filter(Boolean),
  );
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function pdfSecurityFeatures(raw) {
  return [
    ["pdf_javascript", /\/(?:JavaScript|JS)\b/, "JavaScript action"],
    ["pdf_open_action", /\/(?:OpenAction|AA)\b/, "automatic action"],
    ["pdf_launch_action", /\/Launch\b/, "application launch action"],
    ["pdf_embedded_file", /\/(?:EmbeddedFile|Filespec)\b/, "embedded file"],
    ["pdf_rich_media", /\/(?:RichMedia|XFA)\b/, "active or dynamic content"],
  ].filter(([, pattern]) => pattern.test(raw));
}

function pdfDigitalSignatureEvidence(raw) {
  const markers = [];
  if (/\/ByteRange\s*\[\s*\d+(?:\s+\d+){3}\s*\]/.test(raw)) {
    markers.push("ByteRange");
  }
  if (/\/(?:Type\s*\/Sig|FT\s*\/Sig)\b/.test(raw)) {
    markers.push("PDF signature dictionary");
  }
  return {
    status: markers.length > 0 ? "PRESENT" : "NOT_DETECTED",
    markers,
  };
}

function perceptualHash(raw, width, height) {
  const pixels = [];
  for (let row = 0; row < 32; row += 1) {
    for (let column = 0; column < 32; column += 1) {
      const sourceX = Math.min(width - 1, Math.floor((column * width) / 32));
      const sourceY = Math.min(height - 1, Math.floor((row * height) / 32));
      pixels.push(raw[sourceY * width + sourceX]);
    }
  }
  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  return pixels
    .reduce((hex, value, index) => {
      const bit = value >= average ? 1 : 0;
      const nibbleIndex = Math.floor(index / 4);
      const nibble = (Number.parseInt(hex[nibbleIndex], 16) << 1) | bit;
      return `${hex.slice(0, nibbleIndex)}${nibble.toString(16)}${hex.slice(nibbleIndex + 1)}`;
    }, "0".repeat(256));
}

function repeatedRegions(raw, width, height) {
  const blocks = new Map();
  const blockSize = 16;
  for (let y = 0; y + blockSize <= height; y += blockSize) {
    for (let x = 0; x + blockSize <= width; x += blockSize) {
      let total = 0;
      let varianceTotal = 0;
      for (let row = 0; row < blockSize; row += 1) {
        for (let column = 0; column < blockSize; column += 1) total += raw[(y + row) * width + x + column];
      }
      const average = Math.round(total / (blockSize * blockSize));
      for (let row = 0; row < blockSize; row += 1) {
        for (let column = 0; column < blockSize; column += 1) varianceTotal += Math.abs(raw[(y + row) * width + x + column] - average);
      }
      if (varianceTotal < 450) continue;
      const key = `${average}:${Math.round(varianceTotal / 32)}`;
      const prior = blocks.get(key);
      if (prior && Math.abs(prior.x - x) > blockSize * 2 && Math.abs(prior.y - y) > blockSize * 2) return { first: prior, second: { x, y } };
      blocks.set(key, { x, y });
    }
  }
  return null;
}

async function inspectImage(buffer, addFlag) {
  try {
    const image = sharp(buffer, { failOn: "warning" }).rotate().removeAlpha().grayscale().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true });
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const duplicateRegion = repeatedRegions(data, info.width, info.height);
    if (duplicateRegion) {
      addFlag("image_repeated_region", "low", "Visually similar non-adjacent image regions were found. This can result from copied content, seals, or repeating design elements and requires review.", false, 1, { regions: duplicateRegion });
    }
    return { perceptualHash: perceptualHash(data, info.width, info.height), width: info.width, height: info.height, copyMove: duplicateRegion ? "SUSPICIOUS" : "NO_OBVIOUS_MATCH" };
  } catch (error) {
    addFlag("image_forensic_analysis_unavailable", "info", "Pixel-level image analysis could not be completed for this image.", false, 1);
    return null;
  }
}

function inspectPdf(buffer, addFlag) {
  const raw = buffer.toString("latin1");
  let structureClean = true;
  const header = raw.slice(0, 1024).includes("%PDF-");
  if (!header) {
    structureClean = false;
    addFlag(
      "pdf_header_missing",
      "high",
      "The file is identified as a PDF but has no PDF header near the start.",
      true,
    );
  }

  const eofCount = countMatches(raw, /%%EOF/g);
  const startXrefs = [...raw.matchAll(/startxref\s+(\d+)/g)];
  const xrefStreams = countMatches(raw, /\/Type\s*\/XRef\b/g);
  const traditionalTrailers = [...raw.matchAll(/trailer\s*<<(.*?)>>/gs)];

  if (eofCount === 0) {
    structureClean = false;
    addFlag(
      "pdf_eof_missing",
      "high",
      "The PDF has no %%EOF marker.",
      true,
    );
  }

  if (startXrefs.length === 0 && xrefStreams === 0) {
    structureClean = false;
    addFlag(
      "pdf_cross_reference_missing",
      "high",
      "No PDF cross-reference table or cross-reference stream was found.",
      true,
    );
  } else if (startXrefs.length > 0 && startXrefs.length !== eofCount) {
    structureClean = false;
    addFlag(
      "pdf_revision_marker_mismatch",
      "medium",
      `Found ${startXrefs.length} startxref marker(s) and ${eofCount} %%EOF marker(s).`,
      true,
    );
  }

  for (const match of startXrefs) {
    const offset = Number(match[1]);
    const target = raw.slice(offset, offset + 64);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset >= buffer.length ||
      !/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(target)
    ) {
      structureClean = false;
      addFlag(
        "pdf_invalid_startxref",
        "high",
        `A startxref offset (${match[1]}) does not point to a recognizable cross-reference section.`,
        true,
      );
    }
  }

  if (traditionalTrailers.length > 0) {
    const invalidTrailer = traditionalTrailers.some(
      ([, dictionary]) =>
        !/\/Root\s+/.test(dictionary) || !/\/Size\s+\d+/.test(dictionary),
    );
    if (invalidTrailer) {
      structureClean = false;
      addFlag(
        "pdf_trailer_incomplete",
        "medium",
        "A traditional PDF trailer is missing a /Root or numeric /Size entry.",
        true,
      );
    }
  }

  const objectStreams = [...raw.matchAll(/\/Type\s*\/ObjStm\b/g)];
  for (const match of objectStreams) {
    const dictionary = raw.slice(Math.max(0, match.index - 512), match.index + 512);
    const objectCount = dictionary.match(/\/N\s+(\d+)/);
    const firstOffset = dictionary.match(/\/First\s+(\d+)/);
    if (
      (objectCount && Number(objectCount[1]) > 10000) ||
      (firstOffset && Number(firstOffset[1]) > buffer.length)
    ) {
      structureClean = false;
      addFlag(
        "pdf_abnormal_object_stream",
        "medium",
        "An object stream declares an unusually large object count or an out-of-range /First offset.",
        true,
      );
      break;
    }
  }

  if (eofCount > 1) {
    structureClean = false;
    addFlag(
      "pdf_incremental_updates",
      "low",
      `The PDF contains ${eofCount} end-of-file markers, which can indicate incremental saves; this alone does not establish that content was changed.`,
      false,
    );
  }

  for (const [code, , label] of pdfSecurityFeatures(raw)) {
    addFlag(code, code === "pdf_launch_action" ? "high" : "medium", `The PDF contains ${label}. Treat this as a document-security risk; it does not by itself prove document tampering.`, false, null, { category: "active_content" });
  }

  return structureClean;
}

export async function analyzeDocumentForensics(buffer, { mimeType, filename }) {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const md5 = createHash("md5").update(buffer).digest("hex");
  const flags = [];
  let forensicScore = 0;
  let tamperDetected = false;

  function addFlag(code, severity, message, indicatesTampering = false, pageNumber = null, details) {
    const scoreBySeverity = { low: 0.1, medium: 0.3, high: 0.7, critical: 1 };
    flags.push({ code, severity, message, pageNumber, ...(details ? { details } : {}) });
    forensicScore = Math.min(1, forensicScore + (scoreBySeverity[severity] ?? 0));
    tamperDetected ||= indicatesTampering;
  }

  const knownValidSha256 = configuredHashes("FORENSICS_VALID_SHA256_HASHES");
  const knownValidMd5 = configuredHashes("FORENSICS_VALID_MD5_HASHES");
  const blacklistedSha256 = configuredHashes("FORENSICS_BLACKLISTED_SHA256_HASHES");
  const blacklistedMd5 = configuredHashes("FORENSICS_BLACKLISTED_MD5_HASHES");

  if (blacklistedSha256.has(sha256) || blacklistedMd5.has(md5)) {
    addFlag(
      "blacklisted_hash_match",
      "critical",
      "The file hash matches a configured blacklisted hash.",
      true,
    );
  } else if (knownValidSha256.has(sha256) || knownValidMd5.has(md5)) {
    flags.push({
      code: "known_valid_hash_match",
      severity: "info",
      message: "The file hash matches a configured known-valid hash.",
    });
  } else {
    flags.push({
      code: "hash_not_in_reference_lists",
      severity: "info",
      message:
        "The file hash was computed but did not match a configured known-valid or blacklisted hash.",
    });
  }

  const rawLatin1 = buffer.toString("latin1").toLowerCase();
  const utf16le = buffer.toString("utf16le").toLowerCase();
  const matchedSignatures = EDITING_SOFTWARE_SIGNATURES.filter((signature) => {
    const normalizedSignature = signature.toLowerCase();
    return (
      rawLatin1.includes(normalizedSignature) ||
      utf16le.includes(normalizedSignature)
    );
  });

  for (const signature of matchedSignatures) {
    addFlag(
      "editing_software_signature",
      "medium",
      `The file contains the editing-software signature "${signature}". This may identify its producer but does not by itself prove unauthorized alteration.`,
      false,
    );
  }

  const isPdf =
    mimeType === "application/pdf" ||
    filename.toLowerCase().endsWith(".pdf") ||
    buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"));

  let imageEvidence = null;
  let digitalSignature = { status: "NOT_APPLICABLE", markers: [] };
  if (isPdf) {
    digitalSignature = pdfDigitalSignatureEvidence(buffer.toString("latin1"));
    flags.push({
      code:
        digitalSignature.status === "PRESENT"
          ? "pdf_digital_signature_present"
          : "pdf_digital_signature_not_detected",
      severity: "info",
      message:
        digitalSignature.status === "PRESENT"
          ? "PDF digital-signature markers were detected; this check does not verify signature integrity, signer identity, or issuer trust."
          : "No PDF digital-signature markers were detected; this check cannot establish whether a visible signature is genuine.",
    });
    const structureClean = inspectPdf(buffer, addFlag);
    if (structureClean) {
      flags.push({
        code: "pdf_structure_clean",
        severity: "info",
        message:
          "Basic PDF header, cross-reference, and end-of-file checks passed; this does not prove the document is authentic or unmodified.",
      });
    }
  } else {
    flags.push({
      code: "pdf_structure_not_applicable",
      severity: "info",
      message: "PDF structural checks were skipped because the file is not identified as a PDF.",
    });
  }

  if (mimeType === "image/png" || mimeType === "image/jpeg" || /\.(png|jpe?g)$/i.test(filename)) {
    imageEvidence = await inspectImage(buffer, addFlag);
  }
  const duplicate = await findAndRecordFingerprint({ sha256, perceptualHash: imageEvidence?.perceptualHash ?? null, mimeType: isPdf ? "application/pdf" : mimeType, filename });
  for (const match of duplicate.matches) {
    addFlag(match.type === "EXACT" ? "duplicate_file_detected" : "visually_similar_file_detected", match.type === "EXACT" ? "high" : "medium", `${match.type === "EXACT" ? "An identical file" : "A visually similar image"} was previously uploaded as "${match.filename}". Reuse may be legitimate but requires review.`, false, null, { matchType: match.type, matchedFilename: match.filename });
  }

  const verdict = tamperDetected ? "SUSPICIOUS" : flags.some((flag) => flag.severity === "high" || flag.severity === "critical") ? "REVIEW_REQUIRED" : "INCONCLUSIVE";

  return {
    tamper_detected: tamperDetected,
    forensic_score: Number(forensicScore.toFixed(2)),
    verdict,
    evidence: {
      sha256,
      md5,
      duplicateDetection: duplicate.status,
      image: imageEvidence,
      digitalSignature,
    },
    flags,
  };
}
