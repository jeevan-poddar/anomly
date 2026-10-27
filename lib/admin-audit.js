import { createClient } from "@supabase/supabase-js";
import { getMongoDatabase } from "./mongodb.js";

export { getMongoDatabase };

export function getAdminSupabaseClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isInstitutionId(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function withoutSignedUrls(value) {
  if (Array.isArray(value)) return value.map(withoutSignedUrls);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value._bsontype === "ObjectId") return value.toString();

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["signed_url", "signedUrl"].includes(key))
      .map(([key, entry]) => [key, withoutSignedUrls(entry)]),
  );
}
