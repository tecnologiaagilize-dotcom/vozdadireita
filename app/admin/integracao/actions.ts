"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createIntegratedStudy(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: administrator } = await supabase.from("admin_profiles")
    .select("role").eq("id", user.id).maybeSingle();
  if (administrator?.role !== "admin") throw new Error("Acesso restrito ao administrador.");

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const title = String(formData.get("title") ?? "").trim();
  const state = String(formData.get("state_uf") ?? "").trim().toUpperCase();
  const office = String(formData.get("office") ?? "").trim();
  const year = Number(formData.get("year"));
  if (!/^[A-Z0-9_-]{4,40}$/.test(code) || title.length < 5 || title.length > 150 ||
      !["DF", "GO"].includes(state) || ![2026, 2028].includes(year) ||
      !["presidente", "governador", "senador", "deputado_federal", "deputado_distrital", "deputado_estadual", "prefeito", "vereador"].includes(office)) {
    throw new Error("Confira código, título, ano, estado e cargo.");
  }
  if ((year === 2028 && (state !== "GO" || !["prefeito", "vereador"].includes(office))) ||
      (year === 2026 && ["prefeito", "vereador"].includes(office)) ||
      (state === "DF" && office === "deputado_estadual") ||
      (state === "GO" && office === "deputado_distrital")) {
    throw new Error("Cargo incompatível com a eleição ou circunscrição.");
  }

  const { data: election, error: electionError } = await supabase
    .from("integration_elections").select("id").eq("year", year)
    .eq("kind", year === 2028 ? "municipal" : "general").single();
  if (electionError || !election) throw new Error("Cadastre a eleição antes do estudo.");

  const { error } = await supabase.from("integration_studies").insert({
    election_id: election.id, code, title, state_uf: state, office,
    municipality_code: year === 2028 ? "5200258" : null,
    created_by: user.id, status: "draft",
  });
  if (error) throw new Error(`Não foi possível criar o estudo: ${error.message}`);
  revalidatePath("/admin/integracao");
}
