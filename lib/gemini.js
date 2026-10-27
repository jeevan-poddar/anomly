const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeminiConfigurationError";
  }
}

async function generateContent(parts, operation) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigurationError(
      "GOOGLE_GEMINI_API_KEY is not configured.",
    );
  }

  const failures = [];
  for (const model of GEMINI_MODELS) {
    let response;
    try {
      response = await fetch(
        `${GEMINI_API_URL}/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts,
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0,
            },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch {
      failures.push(`${model}: request failed`);
      continue;
    }

    if (!response.ok) {
      failures.push(`${model}: HTTP ${response.status}`);
      continue;
    }

    let result;
    try {
      result = await response.json();
    } catch {
      failures.push(`${model}: invalid JSON response`);
      continue;
    }

    const text = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (text) {
      return text;
    }
    failures.push(`${model}: response contained no text`);
  }

  throw new Error(
    `Gemini ${operation} failed for all configured models (${failures.join("; ")}).`,
  );
}

export async function gemini(image, prompt) {
  const imageData = Buffer.isBuffer(image) ? image : image?.buffer;
  const mimeType = Buffer.isBuffer(image) ? undefined : image?.mimeType;
  if (!Buffer.isBuffer(imageData) || !mimeType) {
    throw new TypeError("Gemini requires an image buffer and MIME type.");
  }

  return generateContent(
    [
      {
        inlineData: {
          mimeType,
          data: imageData.toString("base64"),
        },
      },
      { text: prompt },
    ],
    "extraction",
  );
}

export async function geminiText(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new TypeError("Gemini requires a non-empty text prompt.");
  }

  return generateContent([{ text: prompt }], "text generation");
}
