import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import {
  getAdminSupabaseClient,
  getMongoDatabase,
  isInstitutionId,
} from "../../../../../../lib/admin-audit.js";

const DECISIONS = {
  APPROVE: "APPROVED",
  ISSUE_DEFICIENCY_NOTICE: "FLAGGED",
  REJECT: "REJECTED",
};

function errorResponse(error, status) {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request, { params }) {
  await connection();
  const { id } = await params;
  if (!isInstitutionId(id)) {
    return errorResponse("A valid institution id is required.", 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must contain valid JSON.", 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Object.hasOwn(DECISIONS, body.verdict)
  ) {
    return errorResponse(
      "verdict must be APPROVE, ISSUE_DEFICIENCY_NOTICE, or REJECT.",
      400,
    );
  }
  if (
    body.notes !== undefined &&
    (typeof body.notes !== "string" || body.notes.length > 5000)
  ) {
    return errorResponse("notes must be a string no longer than 5000 characters.", 400);
  }

  const decisionId = randomUUID();
  const reviewedAt = new Date();
  let database;

  try {
    database = await getMongoDatabase();
    await database.collection("audit_decisions").insertOne({
      _id: decisionId,
      institution_id: id,
      verdict: body.verdict,
      status: DECISIONS[body.verdict],
      notes: body.notes?.trim() ?? "",
      reviewed_at: reviewedAt,
    });

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from("institutions")
      .update({ status: DECISIONS[body.verdict] })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      await database.collection("audit_decisions").deleteOne({ _id: decisionId });
      return errorResponse("Institution not found.", 404);
    }

    return Response.json(
      {
        success: true,
        verdict: body.verdict,
        status: data.status,
        reviewedAt: reviewedAt.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (database) {
      try {
        await database.collection("audit_decisions").deleteOne({ _id: decisionId });
      } catch (cleanupError) {
        console.error("Failed to remove incomplete audit decision:", cleanupError);
      }
    }
    console.error("Institution audit decision failed:", error);
    return errorResponse("Unable to save the audit decision.", 500);
  }
}
