import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";

function errorResponse(error, status) {
  return Response.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET() {
  await connection();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from("institutions")
      .select(
        "id, institution_name, trust_name, state, district, program_level, course_name, requested_intake, status",
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Unable to fetch institution applications:", error);
      return errorResponse("Unable to load institution applications.", 500);
    }

    const applications = data.map((institution) => ({
      id: institution.id,
      institutionName: institution.institution_name,
      trustName: institution.trust_name,
      state: institution.state,
      district: institution.district,
      program: `${institution.program_level} · ${institution.course_name}`,
      intake: institution.requested_intake,
      status: institution.status,
    }));

    return Response.json(
      { applications },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Admin applications request failed:", error);
    return errorResponse("Unable to load institution applications.", 500);
  }
}
