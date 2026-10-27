const ENTITY_FIELDS = [
  {
    field: "institution_name",
    label: "institution name",
    aliases: ["institution_name", "institutionName"],
  },
  {
    field: "trust_name",
    label: "trust name",
    aliases: ["trust_name", "trustName"],
  },
  {
    field: "director_names",
    label: "director name",
    aliases: ["director_names", "directorNames", "director_name", "directors"],
  },
];

const APPLICATION_FIELD_CHECKS = [
  {
    field: "institution_name",
    label: "Institution name",
    aliases: ["institution_name", "institutionName"],
    profileField: "institutionName",
    comparison: "name",
  },
  {
    field: "director_names",
    label: "Director names",
    aliases: ["director_names", "directorNames", "director_name", "directors"],
    comparison: "names",
  },
  {
    field: "trust_name",
    label: "Trust name",
    aliases: ["trust_name", "trustName"],
    profileField: "trustName",
    comparison: "name",
  },
  {
    field: "registration_number",
    label: "Registration number",
    aliases: ["registration_number", "registrationNumber"],
    profileField: "registrationNumber",
    comparison: "exact",
  },
  {
    field: "sanctioned_intake",
    label: "Sanctioned intake / requested intake",
    aliases: ["sanctioned_intake", "sanctionedIntake"],
    profileField: "requestedIntake",
    comparison: "exact",
  },
  {
    field: "required_faculty",
    label: "Required faculty / proposed faculty",
    aliases: ["required_faculty", "requiredFaculty"],
    profileField: "proposedFaculty",
    comparison: "exact",
  },
  {
    field: "land_area_acres",
    label: "Land area",
    aliases: ["land_area_acres", "total_land_acres", "land_area"],
    profileField: "landAreaAcres",
    comparison: "exact",
  },
  {
    field: "instructional_area_sqm",
    label: "Instructional area",
    aliases: ["instructional_area_sqm", "instructional_area"],
    profileField: "instructionalAreaSqm",
    comparison: "exact",
  },
  {
    field: "course_name",
    label: "Course name",
    aliases: ["course_name", "courseName"],
    profileField: "courseName",
    comparison: "name",
  },
];

const NAME_MATCH_THRESHOLD = 0.82;
const NON_COMPARABLE_METRIC_KEY =
  /(?:date|time|expiry|expire|issue|document|page|qr|signature|roster.?type)/i;

function errorResponse(error, status) {
  return Response.json({ error }, { status });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshteinSimilarity(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function nameSimilarity(left, right) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftTokens = new Set(normalizedLeft.split(" "));
  const rightTokens = new Set(normalizedRight.split(" "));
  const sharedTokens = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const tokenDice =
    (2 * sharedTokens) / (leftTokens.size + rightTokens.size);

  return Math.max(
    tokenDice,
    levenshteinSimilarity(normalizedLeft, normalizedRight),
  );
}

function valuesForAliases(source, aliases) {
  const values = [];
  for (const alias of aliases) {
    const value = source[alias];
    if (typeof value === "string" && value.trim()) {
      values.push(value.trim());
    } else if (
      Array.isArray(value) &&
      value.every((entry) => typeof entry === "string")
    ) {
      values.push(...value.map((entry) => entry.trim()).filter(Boolean));
    }
  }
  return [...new Set(values)];
}

function comparisonValuesForAliases(source, aliases) {
  const values = [];
  for (const alias of aliases) {
    const value = source[alias];
    if (
      (typeof value === "string" && value.trim() && value.trim().toLowerCase() !== "n/a") ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      values.push(String(value).trim());
    } else if (Array.isArray(value)) {
      const entries = value
        .filter((entry) => typeof entry === "string" && entry.trim())
        .map((entry) => entry.trim());
      if (entries.length) values.push(entries.join("; "));
    }
  }
  return [...new Set(values)];
}

function valuesMatch(left, right, comparison) {
  if (comparison === "name") {
    return nameSimilarity(left, right) >= NAME_MATCH_THRESHOLD;
  }
  if (comparison === "names") {
    const unmatched = right
      .split(";")
      .map((name) => name.trim())
      .filter(Boolean);
    const names = left
      .split(";")
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length !== unmatched.length) return false;
    return names.every((name) => {
      const matchIndex = unmatched.findIndex(
        (candidate) =>
          nameSimilarity(name, candidate) >= NAME_MATCH_THRESHOLD,
      );
      if (matchIndex === -1) return false;
      unmatched.splice(matchIndex, 1);
      return true;
    });
  }
  return normalizeText(left) === normalizeText(right);
}

function checkApplicationProfile(documents, institution, flags) {
  const fieldChecks = [];
  for (const field of APPLICATION_FIELD_CHECKS) {
    const values = documents.flatMap((document) => {
      const extractedMetrics = isRecord(document.data.extracted_metrics)
        ? document.data.extracted_metrics
        : {};
      const documentValues = [
        ...comparisonValuesForAliases(document.data, field.aliases),
        ...comparisonValuesForAliases(extractedMetrics, field.aliases),
      ];
      return [...new Set(documentValues)].map((value) => ({
        value,
        source: document.filename,
        sourceType: "document",
      }));
    });
    const profileValue = institution?.[field.profileField];
    if (
      (typeof profileValue === "string" && profileValue.trim()) ||
      (typeof profileValue === "number" && Number.isFinite(profileValue))
    ) {
      values.push({
        value: String(profileValue).trim(),
        source: "Submitted application",
        sourceType: "application",
      });
    }
    if (values.length === 0) continue;

    const mismatches =
      values.length > 1 &&
      values.some((entry, index) =>
        values
          .slice(index + 1)
          .some((candidate) =>
            !valuesMatch(entry.value, candidate.value, field.comparison),
          ),
      );
    const documentValues = values.filter(
      (entry) => entry.sourceType === "document",
    );
    const documentsConflict =
      documentValues.length > 1 &&
      documentValues.some((entry, index) =>
        documentValues
          .slice(index + 1)
          .some(
            (candidate) =>
              !valuesMatch(entry.value, candidate.value, field.comparison),
          ),
      );
    const status =
      values.length < 2
        ? "INSUFFICIENT_EVIDENCE"
        : mismatches
          ? "MISMATCH"
          : "MATCH";

    fieldChecks.push({
      field: field.field,
      label: field.label,
      status,
      values,
    });

    const alreadyCheckedAcrossDocuments =
      documentsConflict &&
      ["institution_name", "trust_name", "director_names"].includes(field.field);
    if (mismatches && !alreadyCheckedAcrossDocuments) {
      const documentNames = values
        .filter((entry) => entry.sourceType === "document")
        .map((entry) => entry.source);
      const comparedWithApplication = values.some(
        (entry) => entry.sourceType === "application",
      );
      addFlag(
        flags,
        `${comparedWithApplication ? "application" : "ocr"}_${field.field}_mismatch`,
        "WARNING",
        comparedWithApplication
          ? `The ${field.label.toLowerCase()} in the uploaded documents does not match the submitted application.`
          : `The ${field.label.toLowerCase()} differs across uploaded documents.`,
        documentNames,
        {
          field: field.field,
          values,
          explanation:
            comparedWithApplication
              ? "OCR can misread text. Compare the source document and application before making a decision."
              : "OCR can misread text. Compare the source documents to confirm whether the difference is an OCR error.",
        },
      );
    }
  }
  return fieldChecks;
}

function checkSharedOcrMetrics(documents, flags) {
  const metricsByKey = new Map();
  for (const document of documents) {
    const metrics = document.data.extracted_metrics;
    if (!isRecord(metrics)) continue;
    for (const [key, value] of Object.entries(metrics)) {
      if (
        NON_COMPARABLE_METRIC_KEY.test(key) ||
        !(
          (typeof value === "string" && value.trim()) ||
          (typeof value === "number" && Number.isFinite(value))
        )
      ) {
        continue;
      }
      const normalizedKey = normalizeText(key);
      if (!metricsByKey.has(normalizedKey)) {
        metricsByKey.set(normalizedKey, { key, values: [] });
      }
      metricsByKey.get(normalizedKey).values.push({
        value: String(value).trim(),
        source: document.filename,
        sourceType: "document",
      });
    }
  }

  const fieldChecks = [];
  for (const { key, values } of metricsByKey.values()) {
    if (values.length < 2) continue;
    const matches = values.every((entry, index) =>
      values
        .slice(index + 1)
        .every((candidate) => valuesMatch(entry.value, candidate.value, "exact")),
    );
    const label = humanizeMetricKey(key);
    fieldChecks.push({
      field: `extracted_metrics.${key}`,
      label,
      status: matches ? "MATCH" : "MISMATCH",
      values,
    });
    if (!matches) {
      addFlag(
        flags,
        "ocr_metric_mismatch",
        "WARNING",
        `The extracted value for "${label}" differs across uploaded documents.`,
        values.map((entry) => entry.source),
        {
          field: key,
          values,
          explanation:
            "This value appears in multiple documents. Review each source to confirm whether the difference is an OCR error or reflects different document context.",
        },
      );
    }
  }
  return fieldChecks;
}

function humanizeMetricKey(value) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function entityValues(document, aliases) {
  const values = valuesForAliases(document.data, aliases);
  return values.length
    ? [{ values, filename: document.filename }]
    : [];
}

function addFlag(flags, code, severity, message, documents = [], details) {
  flags.push({
    code,
    severity,
    message,
    documents: [...new Set(documents)],
    ...(details ? { details } : {}),
  });
}

function checkEntityConsistency(documents, flags) {
  for (const entity of ENTITY_FIELDS) {
    const values = documents.flatMap((document) =>
      entityValues(document, entity.aliases),
    );
    if (values.length < 2) continue;

    const reference = values[0];
    const conflicts = values
      .slice(1)
      .filter(({ values: candidate }) => {
        if (entity.field !== "director_names") {
          return (
            nameSimilarity(reference.values[0], candidate[0]) <
            NAME_MATCH_THRESHOLD
          );
        }

        const unmatched = [...candidate];
        const matched = reference.values.every((director) => {
          const matchIndex = unmatched.findIndex(
            (name) => nameSimilarity(director, name) >= NAME_MATCH_THRESHOLD,
          );
          if (matchIndex === -1) return false;
          unmatched.splice(matchIndex, 1);
          return true;
        });
        return !matched || unmatched.length > 0;
      });

    if (conflicts.length > 0) {
      const compared = [reference, ...conflicts];
      addFlag(
        flags,
        `${entity.field}_mismatch`,
        "CRITICAL",
        `The ${entity.label} differs across uploaded documents.`,
        compared.map(({ filename }) => filename),
        {
          values: compared.map(({ values: names, filename }) => ({
            value: names.join(", "),
            filename,
          })),
          similarityThreshold: NAME_MATCH_THRESHOLD,
        },
      );
    }
  }
}

function getMetric(document, keys) {
  for (const key of keys) {
    const value = document.data.extracted_metrics?.[key];
    if (Number.isInteger(value) && value >= 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
  }
  return null;
}

function declaredCounts(document) {
  return {
    students:
      document.data.sanctioned_intake ??
      getMetric(document, [
        "sanctioned_intake",
        "total_student_intake",
        "student_intake",
        "declared_student_intake",
      ]),
    faculty:
      document.data.required_faculty ??
      getMetric(document, [
        "required_faculty",
        "sanctioned_faculty",
        "sanctioned_faculty_count",
        "required_faculty_count",
      ]),
  };
}

function rosterCount(document, category) {
  const data = document.data;
  const metrics = data.extracted_metrics ?? {};
  const type = normalizeText(
    `${data.document_type ?? ""} ${data.roster_type ?? ""} ${data.filename}`,
  );
  const categoryTerms =
    category === "faculty"
      ? ["faculty", "teacher", "staff"]
      : ["student", "intake", "enrollment"];
  const isCategoryRoster = categoryTerms.some((term) => type.includes(term));

  const arrayKeys =
    category === "faculty"
      ? ["faculty_roster", "faculty_members", "faculty"]
      : ["student_roster", "students", "student_entries"];

  for (const key of arrayKeys) {
    const value = data[key] ?? metrics[key];
    if (Array.isArray(value)) return value.length;
  }

  if (isCategoryRoster) {
    const entries = data.roster_entries ?? metrics.roster_entries;
    if (Array.isArray(entries)) return entries.length;
  }

  const explicitCountKeys =
    category === "faculty"
      ? ["faculty_roster_count", "roster_count", "actual_faculty_count"]
      : ["student_roster_count", "roster_count", "actual_student_count"];
  for (const key of explicitCountKeys) {
    const value = data[key] ?? metrics[key];
    if (
      Number.isInteger(value) &&
      value >= 0 &&
      isCategoryRoster &&
      (type.includes("roster") ||
        normalizeText(data.roster_type ?? "").includes(category))
    ) {
      return value;
    }
  }

  if (
    Number.isInteger(data.roster_count) &&
    data.roster_count >= 0 &&
    isCategoryRoster &&
    (type.includes("roster") ||
      normalizeText(data.roster_type ?? "").includes(category))
  ) {
    return data.roster_count;
  }
  return null;
}

function checkCountReconciliation(documents, flags) {
  const categories = [
    { key: "students", label: "student intake", declaredKey: "students" },
    { key: "faculty", label: "required faculty", declaredKey: "faculty" },
  ];

  for (const category of categories) {
    const declared = documents.flatMap((document) => {
      const count = declaredCounts(document)[category.declaredKey];
      return Number.isInteger(count) && count >= 0
        ? [{ count, filename: document.filename }]
        : [];
    });
    const actual = documents.flatMap((document) => {
      const count = rosterCount(document, category.key);
      return count === null ? [] : [{ count, filename: document.filename }];
    });

    if (declared.length === 0 || actual.length === 0) continue;

    const expected = declared[0].count;
    const observed = actual.reduce((sum, roster) => sum + roster.count, 0);
    if (new Set(declared.map(({ count }) => count)).size > 1) {
      addFlag(
        flags,
        `${category.key}_declaration_mismatch`,
        "CRITICAL",
        `The declared ${category.label} differs between uploaded documents.`,
        declared.map(({ filename }) => filename),
        { declarations: declared },
      );
    }
    if (expected !== observed) {
      addFlag(
        flags,
        `${category.key}_count_mismatch`,
        "CRITICAL",
        `The declared ${category.label} (${expected}) does not match the supporting roster count (${observed}).`,
        [...declared, ...actual].map(({ filename }) => filename),
        { declared: expected, rosterCount: observed },
      );
    }
  }
}

function meaningfulValue(value) {
  if (typeof value === "string") {
    return value.trim() !== "" && value.trim().toLowerCase() !== "n/a";
  }
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== false;
}

function readPath(source, path) {
  return path.split(".").reduce(
    (value, part) => (isRecord(value) ? value[part] : undefined),
    source,
  );
}

function configuredList(requirements, body, snakeKey, camelKey) {
  const value =
    requirements[snakeKey] ??
    requirements[camelKey] ??
    body[snakeKey] ??
    body[camelKey];
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.trim()) : [];
}

function checkRequiredData(documents, body, flags) {
  const requirements = isRecord(body.requirements) ? body.requirements : {};
  const fields = configuredList(requirements, body, "required_fields", "requiredFields");
  const requiredFields = [...new Set(["institution_name", ...fields])];

  for (const field of requiredFields) {
    const aliases =
      ENTITY_FIELDS.find((entity) => entity.field === field)?.aliases ?? [field];
    const present = documents.some((document) =>
      aliases.some((alias) => {
        const value = readPath(document.data, alias);
        return meaningfulValue(value);
      }),
    );
    if (!present) {
      addFlag(
        flags,
        "required_field_missing",
        "CRITICAL",
        `The mandatory field "${field}" is missing from the uploaded document bundle.`,
        [],
        { field },
      );
    }
  }

  const requiredTypes = configuredList(
    requirements,
    body,
    "required_document_types",
    "requiredDocumentTypes",
  );
  for (const requiredType of requiredTypes) {
    const expected = normalizeText(requiredType);
    const present = documents.some((document) =>
      normalizeText(document.data.document_type ?? "").includes(expected),
    );
    if (!present) {
      addFlag(
        flags,
        "required_document_missing",
        "CRITICAL",
        `A required document of type "${requiredType}" was not provided.`,
        [],
        { documentType: requiredType },
      );
    }
  }

  const requiredSignatures = configuredList(
    requirements,
    body,
    "required_signatures",
    "requiredSignatures",
  );
  for (const requiredSignature of requiredSignatures) {
    const expected = normalizeText(requiredSignature);
    const found = documents.some((document) => {
      const signatures = document.data.signatures;
      if (Array.isArray(signatures)) {
        return signatures.some((signature) => {
          if (typeof signature === "string") {
            return normalizeText(signature).includes(expected);
          }
          if (!isRecord(signature) || signature.signed === false || signature.present === false) {
            return false;
          }
          return normalizeText(
            `${signature.role ?? ""} ${signature.name ?? ""} ${signature.type ?? ""}`,
          ).includes(expected);
        });
      }
      return (
        isRecord(signatures) &&
        Object.entries(signatures).some(
          ([role, present]) =>
            normalizeText(role).includes(expected) &&
            (present === true ||
              (isRecord(present) && present.signed !== false && present.present !== false)),
        )
      );
    });
    if (!found) {
      addFlag(
        flags,
        "required_signature_missing",
        "CRITICAL",
        `Evidence of the required "${requiredSignature}" signature was not found.`,
        [],
        { signature: requiredSignature },
      );
    }
  }
}

function normalizeDocuments(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "The request must include a non-empty documents array." };
  }
  if (value.length > 200) {
    return { error: "The documents array cannot contain more than 200 entries." };
  }

  const documents = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return { error: `Document at index ${index} must be a JSON object.` };
    }
    const nested = entry.extraction ?? entry.metadata;
    if (nested !== undefined && !isRecord(nested)) {
      return {
        error: `Document metadata at index ${index} must be a JSON object.`,
      };
    }
    const data = nested ? { ...entry, ...nested } : entry;
    const filename =
      typeof entry.filename === "string" && entry.filename.trim()
        ? entry.filename.trim()
        : `document-${index + 1}`;
    for (const field of ["institution_name", "trust_name", "document_type"]) {
      const value = data[field] ?? data[field.replace(/_([a-z])/g, (_, char) => char.toUpperCase())];
      if (value !== undefined && value !== null && typeof value !== "string") {
        return {
          error: `Document "${filename}" has an invalid ${field}; expected text.`,
        };
      }
    }
    for (const field of ["issue_date", "expiry_date", "roster_type"]) {
      if (
        data[field] !== undefined &&
        data[field] !== null &&
        typeof data[field] !== "string"
      ) {
        return {
          error: `Document "${filename}" has an invalid ${field}; expected text.`,
        };
      }
    }
    for (const field of [
      "director_names",
      "directorNames",
      "director_name",
      "directors",
    ]) {
      const value = data[field];
      if (
        value !== undefined &&
        value !== null &&
        typeof value !== "string" &&
        (!Array.isArray(value) ||
          value.some((name) => typeof name !== "string"))
      ) {
        return {
          error: `Document "${filename}" has an invalid ${field}; expected text or an array of text values.`,
        };
      }
    }
    if (
      data.signatures !== undefined &&
      data.signatures !== null &&
      !Array.isArray(data.signatures) &&
      !isRecord(data.signatures)
    ) {
      return {
        error: `Document "${filename}" has invalid signatures; expected an array or object.`,
      };
    }
    if (
      Array.isArray(data.signatures) &&
      data.signatures.some(
        (signature) =>
          typeof signature !== "string" && !isRecord(signature),
      )
    ) {
      return {
        error: `Document "${filename}" has invalid signature entries; expected text or objects.`,
      };
    }
    for (const field of [
      "sanctioned_intake",
      "required_faculty",
      "roster_count",
    ]) {
      if (
        data[field] !== undefined &&
        data[field] !== null &&
        (!Number.isInteger(data[field]) || data[field] < 0)
      ) {
        return {
          error: `Document "${filename}" has an invalid ${field}; expected a non-negative integer or null.`,
        };
      }
    }
    if (
      data.extracted_metrics !== undefined &&
      !isRecord(data.extracted_metrics)
    ) {
      return {
        error: `Document "${filename}" has invalid extracted_metrics; expected an object.`,
      };
    }
    documents.push({ filename, data });
  }
  return { documents };
}

export async function reconcileDocuments(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:;|$)/i.test(contentType)) {
    return errorResponse("Content-Type must be application/json.", 415);
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return errorResponse("Request body must contain valid JSON.", 400);
    }
    throw error;
  }

  if (!isRecord(body)) {
    return errorResponse("Request body must be a JSON object.", 400);
  }
  if (body.institution !== undefined && !isRecord(body.institution)) {
    return errorResponse("institution must be a JSON object when provided.", 400);
  }

  const normalized = normalizeDocuments(body.documents);
  if (normalized.error) return errorResponse(normalized.error, 400);

  const flags = [];
  checkEntityConsistency(normalized.documents, flags);
  checkCountReconciliation(normalized.documents, flags);
  checkRequiredData(normalized.documents, body, flags);
  const fieldChecks = [
    ...checkApplicationProfile(normalized.documents, body.institution, flags),
    ...checkSharedOcrMetrics(normalized.documents, flags),
  ];

  const hasCritical = flags.some((flag) => flag.severity === "CRITICAL");
  const status = hasCritical
    ? "REJECTED"
    : flags.length > 0
      ? "DEFICIENT"
      : "APPROVED";
  const confidenceScore = Math.max(
    0,
    Number(
      (
        1 -
        flags.filter((flag) => flag.severity === "CRITICAL").length * 0.15 -
        flags.filter((flag) => flag.severity === "WARNING").length * 0.05
      ).toFixed(2),
    ),
  );

  return Response.json({
    status,
    confidence_score: confidenceScore,
    flags,
    fieldChecks,
    summary: {
      documentsChecked: normalized.documents.length,
      totalFlags: flags.length,
      criticalFlags: flags.filter((flag) => flag.severity === "CRITICAL").length,
      warningFlags: flags.filter((flag) => flag.severity === "WARNING").length,
      fieldsMatched: fieldChecks.filter((check) => check.status === "MATCH").length,
      fieldsMismatched: fieldChecks.filter((check) => check.status === "MISMATCH").length,
      fieldsWithInsufficientEvidence: fieldChecks.filter(
        (check) => check.status === "INSUFFICIENT_EVIDENCE",
      ).length,
    },
  });
}
