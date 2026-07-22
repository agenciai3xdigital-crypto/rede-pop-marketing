import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Painel from "./Painel";

const C = {
  bg: "#F6F7F4", card: "#FFFFFF", ink: "#1C2A2E", sub: "#5C6B70",
  primary: "#0E7C66", line: "#E2E6E1", navy: "#183642", red: "#BC4438"
};

export default function App() {
  const [sessao, setSessao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session); setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function entrar(e) {
    if (e) e.preventDefault();
    setErro(""); setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setEntrando(false);
    if (error) setErro("E-mail ou senha incorretos.");
  }

  async function sair() { await supabase.auth.signOut(); }

  if (carregando) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "system-ui", color: C.sub }}>Carregando…</div>;

  if (!sessao) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'Avenir Next','Segoe UI',system-ui,sans-serif", padding: 16 }}>
        <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 14, padding: 28, width: 360, maxWidth: "100%" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: C.sub, textTransform: "uppercase", marginBottom: 4 }}>Franqueadora Pet · Marketing</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.navy, marginBottom: 18 }}>Diagnóstico &amp; Padrão por Loja</div>
          <div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail"
              type="email" autoComplete="username"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 8, border: "1px solid " + C.line, fontSize: 14, marginBottom: 10 }} />
            <input value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha"
              type="password" autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === "Enter") entrar(); }}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 8, border: "1px solid " + C.line, fontSize: 14, marginBottom: 12 }} />
            {erro && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{erro}</div>}
            <button onClick={entrar} disabled={entrando}
              style={{ width: "100%", background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: entrando ? 0.7 : 1 }}>
              {entrando ? "Entrando…" : "Entrar"}
            </button>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 12 }}>Acesso restrito à equipe de marketing da franqueadora. Usuários são criados pelo administrador no Supabase.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: "#0F2430", color: "#fff", fontSize: 12, padding: "6px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "system-ui" }}>
        <span>Conectado como {sessao.user.email}</span>
        <button onClick={sair} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.35)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Sair</button>
      </div>
      <Painel />
    </div>
  );
}
