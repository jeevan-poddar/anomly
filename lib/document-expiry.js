function parseDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  let year;
  let month;
  let day;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (match) {
    [, year, month, day] = match;
  } else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    [, day, month, year] = match;
  } else if (
    (match = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})[,]?\s+(\d{4})$/))
  ) {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    day = match[1];
    month =
      months.indexOf(
        months.find((name) => name.startsWith(match[2].toLowerCase())) ?? "",
      ) + 1;
    year = match[3];
  } else {
    return null;
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date.getTime();
}

function readDate(data, keys) {
  for (const key of keys) {
    const value = data[key];
    if (
      typeof value === "string" &&
      value.trim() &&
      value.trim().toLowerCase() !== "n/a"
    ) {
      return value.trim();
    }
  }
  return null;
}

function sessionDates(body) {
  const session = body.academic_session ?? body.academicSession;
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    return null;
  }
  const startText = session.start_date ?? session.startDate;
  const endText = session.end_date ?? session.endDate;
  if (typeof startText !== "string" || typeof endText !== "string") return null;

  const start = parseDate(startText);
  const end = parseDate(endText);
  if (start === null || end === null || start > end) {
    return { invalid: true, startText, endText };
  }
  return { start, end, startText, endText };
}

export function checkDocumentExpiry(documents, body = {}) {
  const flags = [];
  const addFlag = (code, severity, message, documents = [], details) => {
    flags.push({
      code,
      severity,
      message,
      documents: [...new Set(documents)],
      ...(details ? { details } : {}),
    });
  };
  const session = sessionDates(body);
  if (session?.invalid) {
    addFlag(
      "invalid_academic_session",
      "WARNING",
      "Academic session dates must be valid dates with the start on or before the end.",
      [],
      { startDate: session.startText, endDate: session.endText },
    );
  } else if (!session) {
    addFlag(
      "academic_session_missing",
      "WARNING",
      "Academic session dates were not supplied; certificate validity could not be checked against the full session.",
    );
  }

  const today = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  for (const entry of documents) {
    const nested = entry.extraction ?? entry.metadata;
    const data =
      nested && typeof nested === "object" && !Array.isArray(nested)
        ? { ...entry, ...nested }
        : entry;
    const filename =
      typeof entry.filename === "string" && entry.filename.trim()
        ? entry.filename.trim()
        : "document";
    const expiryText = readDate(data, ["expiry_date", "expiryDate"]);
    const issueText = readDate(data, ["issue_date", "issueDate"]);
    const expiry = expiryText ? parseDate(expiryText) : null;
    const issue = issueText ? parseDate(issueText) : null;
    const hasCertificateDate = expiryText || issueText;

    if (
      hasCertificateDate &&
      ((expiryText && expiry === null) || (issueText && issue === null))
    ) {
      addFlag(
        "unparseable_certificate_date",
        "WARNING",
        `A certificate date in "${filename}" could not be parsed for timeline validation.`,
        [filename],
        { issueDate: issueText, expiryDate: expiryText },
      );
    }

    if (expiry !== null && expiry < today) {
      addFlag(
        "certificate_expired",
        "CRITICAL",
        `The certificate in "${filename}" expired before the current date.`,
        [filename],
        { expiryDate: expiryText },
      );
    }

    if (!session || session.invalid) continue;
    if (issue !== null && issue > session.start && issue <= session.end) {
      addFlag(
        "certificate_issued_after_session_start",
        "CRITICAL",
        `The certificate in "${filename}" was issued after the academic session began.`,
        [filename],
        { issueDate: issueText, sessionStart: session.startText },
      );
    }

    if (expiry !== null && expiry >= session.start && expiry < session.end) {
      addFlag(
        "certificate_expires_during_session",
        "CRITICAL",
        `The certificate in "${filename}" expires before the academic session ends.`,
        [filename],
        { expiryDate: expiryText, sessionEnd: session.endText },
      );
    } else if (expiry !== null && expiry < session.start) {
      addFlag(
        "certificate_expired_before_session",
        "CRITICAL",
        `The certificate in "${filename}" expires before the academic session begins.`,
        [filename],
        { expiryDate: expiryText, sessionStart: session.startText },
      );
    }

    if (issue !== null && issue > session.end) {
      addFlag(
        "certificate_issued_after_session",
        "CRITICAL",
        `The certificate in "${filename}" was issued after the academic session ended.`,
        [filename],
        { issueDate: issueText, sessionEnd: session.endText },
      );
    }
  }

  return flags;
}
