import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";
import { createIntegratedStudy } from "./actions";

export const dynamic = "force-dynamic";

export default async function IntegratedSystemPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: admin } = await supabase.from("admin_profiles").select("role")
    .eq("id", user.id).maybeSingle();
  if (admin?.role !== "admin") redirect("/admin");

  const [studiesResult, candidatesResult, teamsResult, crmResult] = await Promise.all([
    supabase.from("integration_studies").select("id,code,title,state_uf,office,status,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("integration_candidate_catalog").select("id", { count: "exact", head: true }),
    supabase.from("integration_teams").select("id", { count: "exact", head: true }),
    supabase.from("integration_crm_contacts").select("id", { count: "exact", head: true }),
  ]);
  const setupError = studiesResult.error || candidatesResult.error || teamsResult.error;

  return <AdminShell email={user.email}>
    <div className="admin-heading"><div><span className="badge">TR@DE TECNOLOGIA · OPERAÇÃO</span>
      <h1>Voz da Direita</h1>
      <p>Catálogo oficial, equipes, pesquisas planejadas e atendimento telefônico.</p>
    </div></div>
    {setupError && <section className="admin-panel" role="alert"><p>Instale primeiro a migração <code>20260924_integrated_political_core.sql</code> no banco de homologação. Detalhes: {setupError.message}</p></section>}
    {crmResult.error && !setupError && <section className="admin-panel" role="alert"><p>Para integrar o CRM, instale a migração <code>20260924_crm_integration_boundary.sql</code>. O webhook permanece desativado sem o segredo configurado.</p></section>}
    <div className="metric-grid">
      <div className="metric-card"><div><strong>{candidatesResult.count ?? 0}</strong><span>Candidaturas no novo catálogo</span></div></div>
      <div className="metric-card"><div><strong>{teamsResult.count ?? 0}</strong><span>Equipes cadastradas</span></div></div>
      <div className="metric-card"><div><strong>{studiesResult.data?.length ?? 0}</strong><span>Estudos recentes</span></div></div>
      <div className="metric-card"><div><strong>{crmResult.count ?? 0}</strong><span>Contatos vinculados ao CRM</span></div></div>
    </div>
    <section className="admin-panel"><h2>Novo estudo em rascunho</h2>
      <p>A criação não inicia coleta e não publica resultados.</p>
      <form action={createIntegratedStudy} className="integrated-study-form">
        <label>Código <input required name="code" maxLength={40} placeholder="DF_2026_01" /></label>
        <label>Título <input required name="title" maxLength={150} placeholder="Pesquisa DF — primeira rodada" /></label>
        <label>Ano <select name="year" defaultValue="2026"><option value="2026">2026 — geral</option><option value="2028">2028 — municipal</option></select></label>
        <label>UF <select name="state_uf" defaultValue="DF"><option value="DF">DF</option><option value="GO">GO</option></select></label>
        <label>Cargo <select name="office" defaultValue="senador">
          <option value="presidente">Presidente</option><option value="governador">Governador</option>
          <option value="senador">Senador</option><option value="deputado_federal">Deputado federal</option>
          <option value="deputado_distrital">Deputado distrital (DF)</option><option value="deputado_estadual">Deputado estadual (GO)</option>
          <option value="prefeito">Prefeito (Águas Lindas, 2028)</option><option value="vereador">Vereador (Águas Lindas, 2028)</option>
        </select></label><button className="btn btn-primary" type="submit" disabled={Boolean(setupError)}>Criar rascunho</button>
      </form>
    </section>
    <section className="admin-panel"><h2>Estudos</h2><div className="admin-table-wrap"><table className="admin-table">
      <thead><tr><th>Código</th><th>Nome</th><th>UF</th><th>Cargo</th><th>Estado</th></tr></thead>
      <tbody>{studiesResult.data?.map(study => <tr key={study.id}><td>{study.code}</td><td>{study.title}</td><td>{study.state_uf}</td><td>{study.office}</td><td>{study.status}</td></tr>)}
        {!studiesResult.data?.length && <tr><td colSpan={5} className="empty-cell">Nenhum estudo cadastrado.</td></tr>}</tbody>
    </table></div></section>
  </AdminShell>;
}
