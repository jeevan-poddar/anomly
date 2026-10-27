import { getMongoDatabase } from "./admin-audit.js";

function hammingDistance(left, right) {
  if (left.length !== right.length) return Infinity;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (value) {
      distance += value & 1;
      value >>>= 1;
    }
  }
  return distance;
}

export async function findAndRecordFingerprint({ sha256, perceptualHash, mimeType, filename }) {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DATABASE) {
    return { status: "NOT_CONFIGURED", matches: [] };
  }

  try {
    const collection = (await getMongoDatabase()).collection("forensic_fingerprints");
    await collection.createIndex({ sha256: 1 }, { unique: true });
    const exactMatches = await collection
      .find({ sha256, filename: { $ne: filename } }, { projection: { filename: 1, sha256: 1 } })
      .limit(5)
      .toArray();
    const perceptualMatches = perceptualHash
      ? (await collection
          .find(
            { mimeType, perceptualHash: { $type: "string" }, filename: { $ne: filename } },
            { projection: { filename: 1, perceptualHash: 1 } },
          )
          .limit(500)
          .toArray())
          .filter((entry) => hammingDistance(perceptualHash, entry.perceptualHash) <= 8)
      : [];

    await collection.updateOne(
      { sha256 },
      { $set: { sha256, perceptualHash, mimeType, filename, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    return {
      status: "CHECKED",
      matches: [
        ...exactMatches.map((entry) => ({ type: "EXACT", filename: entry.filename })),
        ...perceptualMatches.map((entry) => ({ type: "VISUALLY_SIMILAR", filename: entry.filename })),
      ],
    };
  } catch (error) {
    console.error("Forensic fingerprint lookup failed:", error);
    return { status: "UNAVAILABLE", matches: [] };
  }
}
