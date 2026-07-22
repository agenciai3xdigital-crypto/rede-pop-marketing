import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "./supabase";
import { LOJAS } from "./lojas";

/* ============ TOKENS ============ */
const C = {
  bg: "#F6F7F4", card: "#FFFFFF", ink: "#1C2A2E", sub: "#5C6B70",
  primary: "#0E7C66", primarySoft: "#E3F1ED", amber: "#D98A16", amberSoft: "#FBF1DC",
  red: "#BC4438", redSoft: "#F9E8E5", line: "#E2E6E1", navy: "#183642"
};
const mono = "'SF Mono','Cascadia Mono','Roboto Mono',Consolas,monospace";
const disp = "'Avenir Next','Segoe UI',system-ui,sans-serif";

/* ============ ANÁLISE DOS CSVs ============ */
const num = (s) => {
  if (s === null || s === undefined || s === "") return 0;
  const v = parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  return isNaN(v) ? 0 : v;
};

function analisar(rows) {
  const meses = {}; const cliMeses = {}; const cliCel = {}; const cliCpf = {}; const telCli = {};
  let colCpf = null;
  if (rows.length) {
    colCpf = Object.keys(rows[0]).find((k) => /cpf/i.test(k)) || null;
  }
  const pedidos = new Set(); let receita = 0, lucro = 0, custoTotal = 0, recDeliv = 0, recRacao = 0, recBanho = 0;
  const setores = {};
  let itensDesc = 0, itens = 0, canalNI = 0;
  for (const r of rows) {
    const tot = num(r["Total Item"]); if (!r["Data"]) continue;
    const [d, m, a] = String(r["Data"]).split("/");
    if (!a) continue;
    const mes = a + "-" + m;
    meses[mes] = meses[mes] || { receita: 0, pedidos: new Set(), clientes: new Set() };
    meses[mes].receita += tot;
    receita += tot; lucro += num(r["Lucro Total"]); custoTotal += num(r["Custo Total"]); itens++;
    const grupoSetor = (r["Grupo Linha"] || "SEM GRUPO").trim() || "SEM GRUPO";
    setores[grupoSetor] = setores[grupoSetor] || { receita: 0, custo: 0, lucro: 0 };
    setores[grupoSetor].receita += tot;
    setores[grupoSetor].custo += num(r["Custo Total"]);
    setores[grupoSetor].lucro += num(r["Lucro Total"]);
    if (r["N. Pedido"]) { pedidos.add(r["N. Pedido"]); meses[mes].pedidos.add(r["N. Pedido"]); }
    const cli = r["Cod. Cliente."] || r["Cod. Cliente"];
    if (cli) {
      meses[mes].clientes.add(cli);
      (cliMeses[cli] = cliMeses[cli] || new Set()).add(mes);
      if (r["Celular"] && String(r["Celular"]).trim()) cliCel[cli] = true; else cliCel[cli] = cliCel[cli] || false;
      if (colCpf) {
        const dig = String(r[colCpf] || "").replace(/\D/g, "");
        if (dig.length === 11) cliCpf[cli] = true; else cliCpf[cli] = cliCpf[cli] || false;
      }
      const tel = String(r["Celular"] || r["Fone"] || "").replace(/\D/g, "");
      if (tel.length >= 10) {
        telCli[tel] = telCli[tel] || {};
        telCli[tel][cli] = String(r["Cliente"] || "").trim();
      }
    }
    const grupo = (r["Grupo Linha"] || "").toUpperCase();
    if (grupo.includes("RACAO")) recRacao += tot;
    if (grupo.includes("BANHO")) recBanho += tot;
    if ((r["Delivery"] || "").toUpperCase() === "SIM") recDeliv += tot;
    if (num(r["Deconto Produto %"]) > 0 || num(r["Desconto Produto %"]) > 0) itensDesc++;
    const canal = (r["Canal venda"] || "").toUpperCase();
    if (!canal || canal.includes("NÃO INFORMADO") || canal.includes("NAO INFORMADO")) canalNI++;
  }
  const clientes = Object.keys(cliMeses);
  const rec2m = clientes.filter((c) => cliMeses[c].size >= 2).length;
  const comCel = clientes.filter((c) => cliCel[c]).length;
  const comCpf = clientes.filter((c) => cliCpf[c]).length;
  // Duplicados prováveis: mesmo telefone em códigos de cliente diferentes
  let cliDuplicados = 0; const gruposDup = [];
  for (const tel of Object.keys(telCli)) {
    const cods = Object.keys(telCli[tel]);
    if (cods.length >= 2) {
      cliDuplicados += cods.length;
      gruposDup.push({ tel, qtd: cods.length, nomes: cods.map((c) => telCli[tel][c] || c) });
    }
  }
  gruposDup.sort((x, y) => y.qtd - x.qtd);
  const mesesOrd = Object.keys(meses).sort();
  return {
    linhas: rows.length, meses: mesesOrd.map((m) => ({
      mes: m, receita: meses[m].receita, pedidos: meses[m].pedidos.size,
      ticket: meses[m].pedidos.size ? meses[m].receita / meses[m].pedidos.size : 0
    })),
    receita, lucro, margem: receita ? (lucro / receita) * 100 : 0,
    custoTotal, cmvPct: receita ? (custoTotal / receita) * 100 : 0,
    setores: Object.keys(setores).map((s) => ({
      setor: s, receita: setores[s].receita,
      pctRec: receita ? (setores[s].receita / receita) * 100 : 0,
      cmv: setores[s].receita ? (setores[s].custo / setores[s].receita) * 100 : 0,
      margem: setores[s].receita ? (setores[s].lucro / setores[s].receita) * 100 : 0
    })).sort((x, y) => y.receita - x.receita),
    pedidos: pedidos.size, ticket: pedidos.size ? receita / pedidos.size : 0,
    clientes: clientes.length,
    recorrencia: clientes.length ? (rec2m / clientes.length) * 100 : 0,
    pctCel: clientes.length ? (comCel / clientes.length) * 100 : 0,
    temColCpf: !!colCpf,
    pctCpf: colCpf && clientes.length ? (comCpf / clientes.length) * 100 : 0,
    cliDuplicados,
    pctDup: clientes.length ? (cliDuplicados / clientes.length) * 100 : 0,
    gruposDup: gruposDup.slice(0, 12),
    totalGruposDup: gruposDup.length,
    pctDeliv: receita ? (recDeliv / receita) * 100 : 0,
    pctRacao: receita ? (recRacao / receita) * 100 : 0,
    pctBanho: receita ? (recBanho / receita) * 100 : 0,
    pctDesc: itens ? (itensDesc / itens) * 100 : 0,
    pctCanalNI: itens ? (canalNI / itens) * 100 : 0
  };
}

const fmtR$ = (v) => "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtP = (v) => v.toFixed(1).replace(".", ",") + "%";

/* KPIs com semáforo: fn devolve 'ok' | 'atencao' | 'critico' */
/* KPIs agrupados por tema */
function kpis(a) {
  if (!a) return [];
  const nMeses = a.meses.length || 1;
  return [
    {
      grupo: "Vendas e resultado", itens: [
        { rot: "Receita média/mês", val: fmtR$(a.receita / nMeses), st: "ok", nota: nMeses + " meses analisados" },
        { rot: "Ticket médio", val: fmtR$(a.ticket), st: a.ticket >= 70 ? "ok" : "atencao", nota: a.pedidos.toLocaleString("pt-BR") + " pedidos" },
        { rot: "CMV global", val: fmtP(a.cmvPct), st: a.cmvPct <= 60 ? "ok" : a.cmvPct <= 68 ? "atencao" : "critico", nota: "custo da mercadoria vendida / receita total" },
        { rot: "Margem bruta", val: fmtP(a.margem), st: a.margem >= 38 ? "ok" : a.margem >= 30 ? "atencao" : "critico", nota: "lucro bruto / receita" }
      ]
    },
    {
      grupo: "Clientes e base", itens: [
        { rot: "Recorrência (2+ meses)", val: fmtP(a.recorrencia), st: a.recorrencia >= 45 ? "ok" : a.recorrencia >= 30 ? "atencao" : "critico", nota: a.clientes.toLocaleString("pt-BR") + " clientes únicos" },
        { rot: "Cadastro com celular", val: fmtP(a.pctCel), st: a.pctCel >= 85 ? "ok" : a.pctCel >= 65 ? "atencao" : "critico", nota: "base contactável p/ recompra" },
        { rot: "Clientes duplicados (prováveis)", val: fmtP(a.pctDup), st: a.pctDup <= 3 ? "ok" : a.pctDup <= 8 ? "atencao" : "critico", nota: a.cliDuplicados.toLocaleString("pt-BR") + " cadastros em " + a.totalGruposDup.toLocaleString("pt-BR") + " grupos c/ mesmo telefone" }
      ]
    },
    {
      grupo: "Canais e operação de venda", itens: [
        { rot: "Receita via delivery", val: fmtP(a.pctDeliv), st: a.pctDeliv >= 15 ? "ok" : "atencao", nota: "participação no faturamento" },
        { rot: "Itens com desconto", val: fmtP(a.pctDesc), st: a.pctDesc <= 12 ? "ok" : a.pctDesc <= 20 ? "atencao" : "critico", nota: "sem motivo registrado no PDV" }
      ]
    },
    {
      grupo: "Mix de receita", itens: [
        { rot: "Receita em ração", val: fmtP(a.pctRacao), st: "ok", nota: "compra recorrente por natureza" },
        { rot: "Banho e tosa", val: fmtP(a.pctBanho), st: a.pctBanho >= 10 ? "ok" : a.pctBanho >= 4 ? "atencao" : "critico", nota: "serviço que gera frequência" }
      ]
    }
  ];
}

/* Perguntas dirigidas geradas pelos dados */
function perguntas(a) {
  if (!a) return [];
  const q = [];
  if (a.recorrencia < 45) q.push({ id: "q_rec", t: `Recorrência: apenas ${fmtP(a.recorrencia)} dos clientes compraram em 2+ meses. Existe contato ativo de recompra (aviso de ração acabando, lista de transmissão)? Se não: falta ferramenta, pessoa ou rotina?` });
  if (a.pctCel < 90) q.push({ id: "q_cel", t: `Cadastro: ${fmtP(100 - a.pctCel)} dos clientes estão sem celular. O caixa pede telefone em toda venda? Há incentivo ao cadastro (desconto, sorteio)?` });
  q.push({ id: "q_cpf", t: "CPF: o caixa pede CPF em toda venda? (Com o app próprio e as integrações 99/iFood identificando por CPF, cliente sem CPF vira duplicado na base.)" });
  if (a.pctCanalNI > 30) q.push({ id: "q_canal", t: `Canal: ${fmtP(a.pctCanalNI)} das vendas sem origem registrada. Por onde chegam os pedidos de delivery (WhatsApp, telefone, iFood)? O problema é processo ou sistema?` });
  if (a.pctDeliv > 10) q.push({ id: "q_deliv", t: `Delivery já é ${fmtP(a.pctDeliv)} da receita. Quem opera? Há área/taxa definida? Está em apps (iFood)? Se não, por quê?` });
  if (a.pctBanho < 8) q.push({ id: "q_banho", t: `Banho e tosa é só ${fmtP(a.pctBanho)} da receita. A loja tem estrutura ociosa, não tem estrutura ou não divulga? Qual a ocupação da agenda hoje? Toparia piloto de assinatura de banho?` });
  if (a.pctDesc > 12) q.push({ id: "q_desc", t: `Desconto: ${fmtP(a.pctDesc)} dos itens saem com desconto. Existe política escrita (quem autoriza, quando) ou é critério de cada vendedor?` });
  q.push({ id: "q_equipe", t: "Equipe: quem são os 2 melhores vendedores e o que fazem de diferente que pode virar script de balcão? Há alguém abaixo da média — é função ou performance?" });
  q.push({ id: "q_bairro", t: "Território: em quais bairros a loja vende pouco e por quê (não entrega, não divulga, concorrente forte)? Já houve ação local nesses bairros?" });
  q.push({ id: "q_insta", t: "Digital: quem cuida do Instagram, quantos posts e Reels por semana, e a loja usa o kit da franqueadora? Se não usa: o que falta nele?" });
  q.push({ id: "q_pedido", t: "Pedido nº 1: se a franqueadora fizer UMA coisa por esta loja nos próximos 60 dias, o que deve ser? Nota 0–10 do apoio atual e por quê." });
  return q;
}

const PADRAO = [
  { t: "CPF capturado em todo cadastro de cliente (chave única do app próprio, 99 e iFood)", seFaz: "Já faz: como o caixa pede e onde o CPF fica registrado?", seImplantar: "Definir com a loja: meta de % de vendas com CPF (sugestão: 90%) e data de início" },
  { t: "Canal de venda registrado no PDV em 100% das vendas", seFaz: "Já faz: quais canais estão configurados no PDV hoje?", seImplantar: "Definir com a loja: lista de canais (balcão, WhatsApp, iFood, app, telefone) e data de início" },
  { t: "Celular capturado em todo cadastro de cliente no caixa", seFaz: "Já faz: o caixa pede em toda venda? Qual o % estimado de captura?", seImplantar: "Definir com a loja: meta de captura (sugestão: 90% dos novos cadastros) e incentivo ao cliente" },
  { t: "Rotina de recompra: aviso de ração/medicamento contínuo a cada 30–45 dias", seFaz: "Já faz: qual a régua atual (dias após a compra, quem dispara, por onde)?", seImplantar: "Definir com a loja: régua proposta (sugestão: 30/45 dias via WhatsApp) e responsável pelo disparo" },
  { t: "WhatsApp Business com catálogo e mensagem automática", seFaz: "Já faz: catálogo está atualizado? Quais mensagens automáticas ativas?", seImplantar: "Definir com a loja: responsável pela configuração e data" },
  { t: "Instagram: mínimo 3 posts + 2 Reels/semana com kit da rede", seFaz: "Já faz: quantos posts e Reels por semana hoje, e quem publica?", seImplantar: "Definir com a loja: meta acordada (sugestão: 3 posts + 2 Reels/semana) e quem publica" },
  { t: "Google Meu Negócio atualizado e avaliações respondidas em 48h", seFaz: "Já faz: quem responde as avaliações e em quanto tempo?", seImplantar: "Definir com a loja: responsável e prazo de resposta acordado" },
  { t: "Política de desconto escrita, com alçada de autorização", seFaz: "Já faz: qual a regra atual e quem autoriza?", seImplantar: "Definir com a loja: proposta de alçada (o que o vendedor pode dar sem autorização e o teto)" },
  { t: "Meta mínima de banho e tosa e agenda de ocupação medida", seFaz: "Já faz: qual a meta atual (banhos/semana ou % da receita) e a ocupação da agenda?", seImplantar: "Definir com a loja: meta proposta (sugestão: partir da capacidade da agenda) e como medir ocupação" },
  { t: "Cartaz de oferta na entrada + venda casada sugerida no caixa", seFaz: "Já faz: quais ofertas e combos estão ativos hoje?", seImplantar: "Definir com a loja: os 2 primeiros combos do mês e onde ficam expostos" },
  { t: "Cadastro de pets (nome, porte, data de vacina) para réguas de contato", seFaz: "Já faz: onde fica o cadastro e quais campos são preenchidos?", seImplantar: "Definir com a loja: ferramenta de cadastro e data de início" }
];

const SERVICOS = [
  "Kit mensal de conteúdo (artes + Reels editáveis + calendário)",
  "Gestão de tráfego local (verba do franqueado, operação da rede)",
  "Régua de recompra via WhatsApp configurada e monitorada",
  "Gestão do Google Meu Negócio e resposta a avaliações",
  "Campanha nacional do mês adaptada à loja",
  "Treinamento mensal de balcão/vendas (15 min, ao vivo)",
  "Relatório mensal de indicadores da loja (este painel)",
  "Apoio sob demanda via canal de chamados (SLA 3–7 dias úteis)"
];

const stCor = { ok: C.primary, atencao: C.amber, critico: C.red };
const stBg = { ok: C.primarySoft, atencao: C.amberSoft, critico: C.redSoft };
const stTxt = { ok: "saudável", atencao: "atenção", critico: "crítico" };

/* ============ GERADOR DE PLANO DE AÇÃO DA UNIDADE ============ */
/* Cada problema detectado vira uma demanda completa: campanha, peças a produzir,
   responsável, prazo e meta — autoexplicativa para qualquer gerente executar. */
function planoAcoes(a, padrao) {
  const acoes = [];
  // Campanha fixa da rede: lançamento do app próprio (vale para todas as lojas)
  acoes.push({
    id: "p_app", problema: "Lançamento do app Rede Pop Pet Center: converter clientes do balcão, WhatsApp, 99 e iFood em cadastros no app próprio (com CPF).",
    campanha: "Campanha \u201cBaixou, Ganhou\u201d — vale-brinde do app",
    demandas: ["Designer: vale-brinde 10\u00d77cm (bifinho c\u00e3o / sach\u00ea gato) com QR do app, validade 30 dias e c\u00f3digo por canal (S9/SI/LJ/WZ)", "Designer: cartaz A3 de vitrine/balc\u00e3o + display de caixa + adesivo de sacola", "Designer: mensagem-modelo de WhatsApp com link do app para a base da loja", "V\u00eddeo: 2 Reels de lan\u00e7amento (como baixar + resgate do brinde na loja)", "Gerente de Mkt: roteiro de 2 frases para o caixa oferecer o app em toda venda", "Gerente de Mkt: validar com a franqueadora os termos 99/iFood antes de inserir o vale nas sacolas dessas plataformas", "Gerente de Mkt: configurar r\u00e9gua p\u00f3s-cadastro (boas-vindas + oferta 1\u00aa compra + aviso de recompra dia 30)"],
    prazo: "21 dias", meta: "Cadastros com CPF no app: 15% dos clientes ativos da loja em 90 dias, resgate rastreado por canal"
  });
  if (a) {
    if (a.recorrencia < 45) acoes.push({
      id: "p_rec", problema: `Só ${fmtP(a.recorrencia)} dos clientes voltam a comprar (maior vazamento de receita da loja).`,
      campanha: "Campanha \u201cRação em Dia\u201d — régua de recompra",
      demandas: ["Designer: 3 templates de mensagem WhatsApp (30/40/45 dias após a compra) com identidade da rede", "Designer: arte de lista de transmissão + cartaz \u201cavise-me quando acabar\u201d para o caixa", "Vídeo: tutorial de 60s ensinando a loja a configurar e disparar a régua", "Gerente de Mkt: definir com a loja quem dispara e em que dia da semana"],
      prazo: "14 dias", meta: "+10 p.p. de recorrência em 90 dias"
    });
    if (a.pctCel < 85) acoes.push({
      id: "p_cel", problema: `${fmtP(100 - a.pctCel)} da base está sem celular — incontactável para qualquer campanha.`,
      campanha: "Campanha \u201cCadastro Premiado\u201d — captura no caixa",
      demandas: ["Designer: cartaz de balcão + display de caixa do sorteio mensal (brinde pet)", "Gerente de Mkt: script de 2 frases para o caixa pedir telefone/CPF em toda venda", "Vídeo: Reels do sorteio do mês para o Instagram da loja"],
      prazo: "10 dias", meta: "90% dos novos cadastros com celular já no 1º mês"
    });
    if (a.pctBanho < 8) acoes.push({
      id: "p_banho", problema: `Banho e tosa é só ${fmtP(a.pctBanho)} da receita — o serviço que mais gera frequência está parado.`,
      campanha: "Campanha \u201cPrimeiro Banho\u201d — ativação do serviço",
      demandas: ["Designer: kit completo (arte de vitrine, cartaz de rua, arte de oferta 1º banho com desconto)", "Vídeo: 2 Reels modelo de antes/depois de banho para a loja replicar", "Designer: cartão fidelidade físico/digital (5 banhos = 1 grátis)", "Gerente de Mkt: montar agenda de ocupação e meta semanal com a loja"],
      prazo: "21 dias", meta: "Banho e tosa a 5% da receita em 90 dias"
    });
    if (a.pctCanalNI > 30) acoes.push({
      id: "p_canal", problema: `${fmtP(a.pctCanalNI)} das vendas sem canal registrado — impossível medir o retorno de qualquer campanha.`,
      campanha: "Instrução operacional \u201cDe onde veio essa venda?\u201d",
      demandas: ["Gerente de Mkt: definir os canais padrão no PDV (balcão, WhatsApp, iFood, app, telefone)", "Designer: lembrete visual para o monitor do caixa", "Vídeo: microtreinamento de 90s para a equipe do caixa"],
      prazo: "7 dias", meta: "Canal registrado em 95% das vendas no mês seguinte"
    });
    if (a.pctDesc > 12) acoes.push({
      id: "p_desc", problema: `${fmtP(a.pctDesc)} dos itens saem com desconto sem regra — margem virando desconto de balcão.`,
      campanha: "Oferta oficial no lugar do desconto de balcão",
      demandas: ["Gerente de Mkt: propor política de desconto com alçada (o que o vendedor pode dar e quando)", "Designer: régua mensal de ofertas oficiais (cartazes + artes de story) para substituir o desconto informal"],
      prazo: "14 dias", meta: "Desconto informal abaixo de 10% dos itens em 60 dias"
    });
    if (a.pctDeliv >= 10) acoes.push({
      id: "p_deliv", problema: `Delivery já é ${fmtP(a.pctDeliv)} da receita e não tem material próprio.`,
      campanha: "Kit Delivery da unidade",
      demandas: ["Designer: arte do cardápio/catálogo de WhatsApp + mapa da área de entrega + ímã de geladeira", "Vídeo: Reels \u201cpeça sem sair de casa\u201d com o entregador da loja", "Gerente de Mkt: revisar presença nos apps (iFood/99) e taxa de entrega comunicada"],
      prazo: "21 dias", meta: "Delivery a +5 p.p. de participação em 90 dias"
    });
    if (a.pctDup > 3) acoes.push({
      id: "p_dup", problema: `${a.cliDuplicados} cadastros duplicados prováveis (${fmtP(a.pctDup)} da base) — risco na migração para o app.`,
      campanha: "Higienização da base antes do app",
      demandas: ["Gerente de Mkt: enviar à loja a lista de duplicados deste painel para o caixa unificar", "Gerente de Mkt: incluir a conferência na rotina semanal da loja até zerar"],
      prazo: "30 dias", meta: "Base sem duplicados visíveis antes da migração"
    });
    if (a.ticket < 70) acoes.push({
      id: "p_ticket", problema: `Ticket médio de ${fmtR$(a.ticket)} — abaixo do potencial da categoria.`,
      campanha: "Campanha \u201cLeve Junto\u201d — venda casada",
      demandas: ["Designer: cartazes de combo (ração + petisco / banho + hidratação) e etiquetas de gôndola", "Gerente de Mkt: script de sugestão no caixa (1 frase por combo)", "Vídeo: Reels dos combos do mês"],
      prazo: "14 dias", meta: "+8% de ticket médio em 60 dias"
    });
  }
  return acoes;
}


/* ============ COMPONENTE ============ */
export default function Painel() {
  const [loja, setLoja] = useState("");
  const [an, setAn] = useState(null);
  const [resp, setResp] = useState({});
  const [feito, setFeito] = useState({});
  const [padrao, setPadrao] = useState({});
  const [servicos, setServicos] = useState({});
  const [obsPadrao, setObsPadrao] = useState({});
  const [melhorias, setMelhorias] = useState("");
  const [salvas, setSalvas] = useState([]);
  const [msg, setMsg] = useState("");
  const [aba, setAba] = useState("numeros");
  const [preenchedor, setPreenchedor] = useState("");
  const [participantes, setParticipantes] = useState("");
  const [historico, setHistorico] = useState([]);
  const [planoStatus, setPlanoStatus] = useState({});
  const fileRef = useRef(null);

  useEffect(() => { carregarLista(); }, []);

  async function carregarLista() {
    try {
      const { data, error } = await supabase.from("fichas").select("loja").order("loja");
      if (error) throw error;
      setSalvas((data || []).map((r) => r.loja));
    } catch { setSalvas([]); }
  }

  function onFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    let todos = []; let restantes = files.length;
    setMsg("Lendo " + files.length + " arquivo(s)…");
    files.forEach((f) => {
      Papa.parse(f, {
        header: true, delimiter: ";", skipEmptyLines: true, encoding: "utf-8",
        complete: (res) => {
          todos = todos.concat(res.data);
          if (--restantes === 0) {
            const a = analisar(todos);
            setAn(a);
            setMsg(a.linhas.toLocaleString("pt-BR") + " linhas de venda analisadas, " + a.meses.length + " meses.");
          }
        },
        error: () => { if (--restantes === 0) setMsg("Erro ao ler arquivo. Confira se é o CSV exportado do PDV (separado por ponto e vírgula)."); }
      });
    });
  }

  async function salvar() {
    if (!loja.trim()) { setMsg("Selecione a loja (FR) antes de salvar."); return; }
    if (!preenchedor.trim()) { setMsg("Informe quem está preenchendo a ficha antes de salvar."); return; }
    if (!participantes) { setMsg("Marque quem participou da reunião (franqueado, gerente da loja ou ambos)."); return; }
    const registro = { quando: new Date().toISOString(), preenchedor: preenchedor.trim(), participantes };
    const novoHist = [...historico, registro];
    const dados = { loja: loja.trim(), preenchedor: preenchedor.trim(), participantes, historico: novoHist, an, resp, feito, padrao, obsPadrao, servicos, melhorias, planoStatus };
    try {
      const { error } = await supabase.from("fichas").upsert({ loja: loja.trim(), dados, updated_at: new Date().toISOString() }, { onConflict: "loja" });
      if (error) throw error;
      setHistorico(novoHist); setMsg("Ficha de " + loja + " salva por " + preenchedor.trim() + "."); carregarLista();
    } catch { setMsg("Não foi possível salvar. Verifique a conexão e tente novamente."); }
  }

  async function abrir(nome) {
    try {
      const { data, error } = await supabase.from("fichas").select("dados").eq("loja", nome).single();
      if (error) throw error;
      if (data && data.dados) {
        const d = data.dados;
        setLoja(d.loja || nome); setAn(d.an || null); setResp(d.resp || {});
        setFeito(d.feito || {}); setPadrao(d.padrao || {}); setObsPadrao(d.obsPadrao || {});
        setServicos(d.servicos || {}); setMelhorias(d.melhorias || "");
        setPreenchedor(d.preenchedor || ""); setParticipantes(d.participantes || "");
        setHistorico(d.historico || []); setPlanoStatus(d.planoStatus || {});
        setMsg("Ficha de " + (d.loja || nome) + " carregada."); setAba("numeros");
      }
    } catch { setMsg("Ficha não encontrada."); }
  }

  function exportar() {
    const qs = perguntas(an);
    const L = [];
    L.push("FICHA DE DIAGNÓSTICO DE MARKETING — " + (loja || "(sem nome)"));
    L.push("Gerada em: " + new Date().toLocaleString("pt-BR"));
    L.push("Preenchida por: " + (preenchedor || "—"));
    L.push("Participantes da reunião: " + (participantes || "—"));
    L.push("");
    if (historico.length) {
      L.push("== HISTÓRICO DE PREENCHIMENTO ==");
      historico.forEach((h) => L.push("- " + new Date(h.quando).toLocaleString("pt-BR") + " · " + h.preenchedor + " · reunião com: " + h.participantes));
      L.push("");
    }
    if (an) {
      L.push("== INDICADORES DO PDV (por setor de análise) ==");
      kpis(an).forEach((gr) => {
        L.push("[" + gr.grupo.toUpperCase() + "]");
        gr.itens.forEach((k) => L.push("- " + k.rot + ": " + k.val + " [" + stTxt[k.st] + "]"));
      });
      L.push("");
      L.push("== RECEITA, CMV E MARGEM POR SETOR (Grupo Linha) ==");
      an.setores.filter((s) => s.pctRec >= 0.5).forEach((s) => {
        L.push("- " + s.setor + ": " + fmtR$(s.receita) + " (" + fmtP(s.pctRec) + " da receita) | CMV " + fmtP(s.cmv) + " | margem bruta " + fmtP(s.margem));
      });
      L.push("");
      if (an.totalGruposDup > 0) {
        L.push("== DUPLICADOS PROVÁVEIS (mesmo telefone, códigos diferentes) ==");
        L.push("Total: " + an.cliDuplicados + " cadastros em " + an.totalGruposDup + " grupos. Maiores grupos:");
        an.gruposDup.forEach((g) => L.push("- " + g.tel + " → " + g.qtd + " cadastros: " + g.nomes.join(" / ")));
        L.push("");
      }
    }
    L.push("== ENTREVISTA (perguntas dirigidas) ==");
    qs.forEach((q, i) => {
      L.push((i + 1) + ". " + q.t);
      L.push("   Perguntado: " + (feito[q.id] ? "SIM" : "não"));
      L.push("   Resposta: " + (resp[q.id] || "—"));
    });
    L.push("");
    L.push("== PADRÃO OPERACIONAL DE MARKETING DA LOJA ==");
    PADRAO.forEach((p, i) => {
      L.push("- " + p.t + " → " + (padrao[i] || "não avaliado") + (obsPadrao[i] ? " | " + (padrao[i] === "Já faz" ? "Registrado: " : "Definido: ") + obsPadrao[i] : ""));
    });
    L.push("");
    L.push("== PRESTAÇÃO DE SERVIÇO MENSAL DA FRANQUEADORA ==");
    SERVICOS.forEach((s, i) => { if (servicos[i]) L.push("- " + s); });
    L.push("");
    const acoesExp = planoAcoes(an, padrao);
    if (acoesExp.length) {
      L.push("== PLANO DE AÇÃO DA UNIDADE (gerado dos indicadores) ==");
      acoesExp.forEach((ac, n) => {
        L.push((n + 1) + ". " + ac.campanha + "  [status: " + (planoStatus[ac.id] || "A produzir") + "]");
        L.push("   Problema: " + ac.problema);
        ac.demandas.forEach((d) => L.push("   - " + d));
        L.push("   Prazo: " + ac.prazo + " | Meta: " + ac.meta);
      });
      const impl = PADRAO.map((p, i) => ({ p, i })).filter(({ i }) => padrao[i] === "Implantar");
      if (impl.length) {
        L.push("   Itens do padrão a implantar (com definição acordada):");
        impl.forEach(({ p, i }) => L.push("   - " + p.t + (obsPadrao[i] ? " → " + obsPadrao[i] : " → definição pendente (registrar na próxima reunião)")));
      }
      L.push("");
    }
    L.push("== MELHORIAS RÁPIDAS SUGERIDAS (prazo 7 dias) ==");
    L.push(melhorias || "—");
    const blob = new Blob([L.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Ficha_" + (loja || "loja").replace(/\s+/g, "_") + ".txt";
    a.click();
  }

  const qs = perguntas(an);
  const totalCampos = qs.length + PADRAO.length;
  const preenchidos = qs.filter((q) => (resp[q.id] || "").trim()).length + PADRAO.filter((_, i) => padrao[i]).length;
  const prog = totalCampos ? Math.round((preenchidos / totalCampos) * 100) : 0;

  const abas = [
    ["numeros", "1 · Números do PDV"],
    ["entrevista", "2 · Entrevista"],
    ["padrao", "3 · Padrão da loja"],
    ["servico", "4 · Serviço mensal"],
    ["plano", "5 · Plano de ação"]
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: disp, color: C.ink }}>
      {/* Cabeçalho */}
      <div style={{ background: C.navy, color: "#fff", padding: "18px 20px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ flex: "1 1 260px" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.75, textTransform: "uppercase" }}>Franqueadora Pet · Marketing</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Diagnóstico &amp; Padrão por Loja</div>
          </div>
          <select value={loja} onChange={(e) => setLoja(e.target.value)}
            style={{ flex: "1 1 220px", padding: "10px 12px", borderRadius: 8, border: "none", fontSize: 14, background: "#fff", color: C.ink }}>
            <option value="">Selecione a loja (FR)…</option>
            {LOJAS.map((l) => (
              <option key={l.cod} value={l.cod + (l.nome ? " — " + l.nome : "")}>{l.cod}{l.nome ? " — " + l.nome : ""}</option>
            ))}
          </select>
          <button onClick={salvar} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Salvar ficha</button>
          <button onClick={exportar} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.4)", borderRadius: 8, padding: "10px 14px", fontSize: 14, cursor: "pointer" }}>Baixar .txt</button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px 60px" }}>
        {/* Identificação da reunião */}
        <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Registro da reunião</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <input value={preenchedor} onChange={(e) => setPreenchedor(e.target.value)}
              placeholder="Quem está preenchendo (ex.: Bruno — Ger. Marketing)"
              style={{ flex: "1 1 250px", padding: "9px 12px", borderRadius: 8, border: "1px solid " + C.line, fontSize: 13 }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["Franqueado", "Gerente da loja", "Ambos"].map((op) => (
                <button key={op} onClick={() => setParticipantes(op)}
                  style={{ padding: "8px 12px", borderRadius: 18, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid " + (participantes === op ? C.primary : C.line), background: participantes === op ? C.primarySoft : "#fff", color: participantes === op ? C.primary : C.ink }}>
                  {op === "Ambos" ? "Ambos na reunião" : op}
                </button>
              ))}
            </div>
          </div>
          {historico.length > 0 && (
            <div style={{ marginTop: 10, borderTop: "1px solid " + C.line, paddingTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 4 }}>Histórico de preenchimento desta ficha</div>
              {historico.slice().reverse().map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: C.sub, fontFamily: mono, marginBottom: 2 }}>
                  {new Date(h.quando).toLocaleString("pt-BR")} · {h.preenchedor} · reunião com: {h.participantes.toLowerCase()}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Upload + fichas salvas */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: "2 1 320px", background: C.card, border: "1px dashed " + C.primary, borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Relatórios do PDV (CSV)</div>
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>Selecione os arquivos mensais exportados do sistema (separados por ponto e vírgula). Vários meses de uma vez.</div>
            <input ref={fileRef} type="file" accept=".csv" multiple onChange={onFiles} style={{ fontSize: 13 }} />
            {msg && <div style={{ marginTop: 10, fontSize: 13, color: C.primary, fontWeight: 600 }}>{msg}</div>}
          </div>
          <div style={{ flex: "1 1 220px", background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Fichas salvas</div>
            {salvas.length === 0 && <div style={{ fontSize: 13, color: C.sub }}>Nenhuma ficha salva ainda. Preencha e use “Salvar ficha”.</div>}
            {salvas.map((s) => (
              <button key={s} onClick={() => abrir(s)} style={{ display: "block", width: "100%", textAlign: "left", background: C.bg, border: "1px solid " + C.line, borderRadius: 8, padding: "8px 10px", marginBottom: 6, fontSize: 13, cursor: "pointer" }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Progresso */}
        <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: prog === 100 ? C.primary : C.ink }}>{prog}%</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>Ficha preenchida ({preenchidos} de {totalCampos} campos)</div>
            <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: prog + "%", height: "100%", background: C.primary, transition: "width .3s" }} />
            </div>
          </div>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {abas.map(([id, rot]) => (
            <button key={id} onClick={() => setAba(id)}
              style={{ padding: "9px 14px", borderRadius: 20, border: "1px solid " + (aba === id ? C.primary : C.line), background: aba === id ? C.primary : C.card, color: aba === id ? "#fff" : C.ink, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{rot}</button>
          ))}
        </div>

        {/* ABA 1 — NÚMEROS */}
        {aba === "numeros" && (
          <div>
            {!an && <div style={{ background: C.card, borderRadius: 12, border: "1px solid " + C.line, padding: 24, textAlign: "center", color: C.sub, fontSize: 14 }}>Suba os CSVs do PDV para o painel calcular os indicadores e gerar as perguntas da entrevista.</div>}
            {an && (
              <div>
                {kpis(an).map((gr) => (
                  <div key={gr.grupo} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: C.navy, marginBottom: 8, borderBottom: "2px solid " + C.line, paddingBottom: 4 }}>{gr.grupo}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(215px,1fr))", gap: 10 }}>
                      {gr.itens.map((k) => (
                        <div key={k.rot} style={{ background: C.card, border: "1px solid " + C.line, borderLeft: "4px solid " + stCor[k.st], borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontSize: 12, color: C.sub }}>{k.rot}</div>
                          <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, margin: "2px 0" }}>{k.val}</div>
                          <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, color: stCor[k.st], background: stBg[k.st], borderRadius: 10, padding: "1px 8px" }}>{stTxt[k.st]}</div>
                          <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>{k.nota}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Receita, CMV e margem por setor</div>
                  <div style={{ display: "flex", gap: 8, fontSize: 11, fontWeight: 700, color: C.sub, borderBottom: "2px solid " + C.line, paddingBottom: 4, marginBottom: 4 }}>
                    <div style={{ flex: 2 }}>Setor</div>
                    <div style={{ width: 92, textAlign: "right" }}>Receita</div>
                    <div style={{ width: 62, textAlign: "right" }}>% Rec.</div>
                    <div style={{ width: 62, textAlign: "right" }}>CMV</div>
                    <div style={{ width: 72, textAlign: "right" }}>Mg. bruta</div>
                  </div>
                  {an.setores.filter((s) => s.pctRec >= 0.5).map((s) => (
                    <div key={s.setor} style={{ display: "flex", gap: 8, fontSize: 12, fontFamily: mono, padding: "5px 0", borderBottom: "1px solid " + C.line, alignItems: "baseline" }}>
                      <div style={{ flex: 2, fontFamily: disp, fontWeight: 600 }}>{s.setor}</div>
                      <div style={{ width: 92, textAlign: "right" }}>{fmtR$(s.receita)}</div>
                      <div style={{ width: 62, textAlign: "right" }}>{fmtP(s.pctRec)}</div>
                      <div style={{ width: 62, textAlign: "right", color: s.cmv > 65 ? C.red : C.ink }}>{fmtP(s.cmv)}</div>
                      <div style={{ width: 72, textAlign: "right", color: s.margem >= 40 ? C.primary : C.ink, fontWeight: 700 }}>{fmtP(s.margem)}</div>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>Setores com menos de 0,5% da receita ocultados. CMV alto em setor de alto giro (ex.: ração) é esperado — compare cada setor com a média da rede, não entre setores.</div>
                </div>
                <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Receita e ticket por mês</div>
                  {an.meses.map((m) => {
                    const max = Math.max(...an.meses.map((x) => x.receita));
                    return (
                      <div key={m.mes} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={{ fontFamily: mono, fontSize: 12, width: 62 }}>{m.mes}</div>
                        <div style={{ flex: 1, height: 16, background: C.bg, borderRadius: 4 }}>
                          <div style={{ width: (m.receita / max) * 100 + "%", height: "100%", background: C.primary, borderRadius: 4 }} />
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 12, width: 90, textAlign: "right" }}>{fmtR$(m.receita)}</div>
                        <div style={{ fontFamily: mono, fontSize: 11, color: C.sub, width: 88, textAlign: "right" }}>tkt {fmtR$(m.ticket)}</div>
                      </div>
                    );
                  })}
                </div>
                {an.totalGruposDup > 0 && (
                  <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Duplicados prováveis na base ({an.totalGruposDup.toLocaleString("pt-BR")} grupos)</div>
                    <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>Mesmo telefone cadastrado em códigos de cliente diferentes. Unificar antes da migração para o app próprio — os 12 maiores grupos:</div>
                    {an.gruposDup.map((g) => (
                      <div key={g.tel} style={{ display: "flex", gap: 10, alignItems: "baseline", borderBottom: "1px solid " + C.line, padding: "6px 0" }}>
                        <div style={{ fontFamily: mono, fontSize: 12, minWidth: 105 }}>{g.tel.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}</div>
                        <div style={{ fontFamily: mono, fontSize: 12, color: C.red, fontWeight: 700, minWidth: 60 }}>{g.qtd} cadastros</div>
                        <div style={{ fontSize: 12, color: C.sub, flex: 1 }}>{g.nomes.slice(0, 4).join(" · ")}{g.nomes.length > 4 ? " …" : ""}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ABA 2 — ENTREVISTA */}
        {aba === "entrevista" && (
          <div>
            {!an && <div style={{ background: C.amberSoft, border: "1px solid " + C.amber, borderRadius: 10, padding: 14, fontSize: 13, marginBottom: 12 }}>Sem os CSVs, as perguntas específicas dos dados não são geradas — suba os relatórios na tela inicial. As perguntas gerais aparecem abaixo.</div>}
            {qs.map((q, i) => (
              <div key={q.id} style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!feito[q.id]} onChange={(e) => setFeito({ ...feito, [q.id]: e.target.checked })} style={{ marginTop: 4, width: 17, height: 17, accentColor: C.primary }} />
                  <div style={{ fontSize: 14, lineHeight: 1.45 }}><strong style={{ color: C.primary }}>{i + 1}.</strong> {q.t}</div>
                </label>
                <textarea value={resp[q.id] || ""} onChange={(e) => setResp({ ...resp, [q.id]: e.target.value })}
                  placeholder="Resposta do franqueado, por extenso…"
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 8, minHeight: 64, borderRadius: 8, border: "1px solid " + C.line, padding: 10, fontSize: 13, fontFamily: disp, resize: "vertical" }} />
              </div>
            ))}
            <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Melhorias rápidas sugeridas nesta reunião (prazo 7 dias)</div>
              <textarea value={melhorias} onChange={(e) => setMelhorias(e.target.value)}
                placeholder="Ex.: 1) Atualizar Google Meu Negócio e responder as 10 últimas avaliações; 2) Ativar mensagem de recompra de ração aos 30 dias; 3) Cartaz de banho e tosa na entrada."
                style={{ width: "100%", boxSizing: "border-box", minHeight: 80, borderRadius: 8, border: "1px solid " + C.line, padding: 10, fontSize: 13, fontFamily: disp, resize: "vertical" }} />
            </div>
          </div>
        )}

        {/* ABA 3 — PADRÃO */}
        {aba === "padrao" && (
          <div>
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>Para cada item do padrão mínimo da rede, marque a situação da loja e anote o que for preciso. Isso forma o padrão operacional de marketing desta unidade.</div>
            {PADRAO.map((pItem, i) => (
              <div key={i} style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{pItem.t}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Já faz", "Implantar", "Não se aplica"].map((op) => (
                    <button key={op} onClick={() => setPadrao({ ...padrao, [i]: op })}
                      style={{ padding: "7px 12px", borderRadius: 18, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid " + (padrao[i] === op ? C.primary : C.line), background: padrao[i] === op ? C.primarySoft : "#fff", color: padrao[i] === op ? C.primary : C.ink }}>{op}</button>
                  ))}
                </div>
                {padrao[i] === "Já faz" && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, marginBottom: 4 }}>{pItem.seFaz}</div>
                    <input value={obsPadrao[i] || ""} onChange={(e) => setObsPadrao({ ...obsPadrao, [i]: e.target.value })}
                      placeholder="Registrar a meta/prática atual por extenso…"
                      style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid " + C.line, padding: 9, fontSize: 13 }} />
                  </div>
                )}
                {padrao[i] === "Implantar" && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 4 }}>{pItem.seImplantar}</div>
                    <input value={obsPadrao[i] || ""} onChange={(e) => setObsPadrao({ ...obsPadrao, [i]: e.target.value })}
                      placeholder="Anotar aqui a meta/definição acordada na reunião — isso entra no plano de ação…"
                      style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid " + C.amber, padding: 9, fontSize: 13, background: C.amberSoft }} />
                  </div>
                )}
                {padrao[i] === "Não se aplica" && (
                  <input value={obsPadrao[i] || ""} onChange={(e) => setObsPadrao({ ...obsPadrao, [i]: e.target.value })}
                    placeholder="Por que não se aplica a esta loja?"
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 8, borderRadius: 8, border: "1px solid " + C.line, padding: 9, fontSize: 13 }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ABA 5 — PLANO DE AÇÃO */}
        {aba === "plano" && (
          <div>
            {!an && <div style={{ background: C.card, borderRadius: 12, border: "1px solid " + C.line, padding: 24, textAlign: "center", color: C.sub, fontSize: 14 }}>Suba os CSVs do PDV — o plano de ação é gerado automaticamente a partir dos problemas detectados nos números.</div>}
            {an && (() => {
              const acoes = planoAcoes(an, padrao);
              const implantar = PADRAO.map((pI, i) => ({ pI, i })).filter(({ i }) => padrao[i] === "Implantar");
              return (
                <div>
                  <div style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>Plano de melhoria desta unidade, gerado dos indicadores. Cada bloco é uma demanda completa — problema, campanha, peças a produzir, prazo e meta — pronta para a equipe executar.</div>
                  {acoes.length === 0 && <div style={{ background: C.primarySoft, border: "1px solid " + C.primary, borderRadius: 12, padding: 16, fontSize: 14 }}>Nenhum problema crítico detectado nos números desta loja — manter o padrão e o kit mensal.</div>}
                  {acoes.map((ac, n) => (
                    <div key={ac.id} style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{n + 1}. {ac.campanha}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {["A produzir", "Em produção", "Entregue"].map((s) => (
                            <button key={s} onClick={() => setPlanoStatus({ ...planoStatus, [ac.id]: s })}
                              style={{ padding: "5px 10px", borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid " + (planoStatus[ac.id] === s ? C.primary : C.line), background: planoStatus[ac.id] === s ? C.primarySoft : "#fff", color: planoStatus[ac.id] === s ? C.primary : C.sub }}>{s}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: C.red, margin: "6px 0 8px", fontWeight: 600 }}>Problema: {ac.problema}</div>
                      <div style={{ fontSize: 13, marginBottom: 4, fontWeight: 700, color: C.sub }}>Demandas para a equipe:</div>
                      {ac.demandas.map((d, j) => (
                        <div key={j} style={{ fontSize: 13, padding: "4px 0 4px 12px", borderLeft: "3px solid " + C.primarySoft, marginBottom: 3 }}>{d}</div>
                      ))}
                      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, fontFamily: mono }}>
                        <div><span style={{ color: C.sub }}>Prazo:</span> <strong>{ac.prazo}</strong></div>
                        <div><span style={{ color: C.sub }}>Meta:</span> <strong>{ac.meta}</strong></div>
                      </div>
                    </div>
                  ))}
                  {implantar.length > 0 && (
                    <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Itens do padrão a implantar nesta loja</div>
                      {implantar.map(({ pI, i }) => (
                        <div key={i} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid " + C.line }}>
                          <div>• {pI.t}</div>
                          {obsPadrao[i]
                            ? <div style={{ color: C.primary, fontWeight: 600, paddingLeft: 12 }}>Definido: {obsPadrao[i]}</div>
                            : <div style={{ color: C.amber, fontWeight: 600, paddingLeft: 12 }}>Definição pendente — acordar meta com a loja e registrar na aba 3</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ABA 4 — SERVIÇO MENSAL */}
        {aba === "servico" && (
          <div>
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>Marque o que a franqueadora vai prestar mensalmente a esta loja — o pacote sai da entrevista e do nível de maturidade da unidade.</div>
            {SERVICOS.map((s, i) => (
              <label key={i} style={{ display: "flex", gap: 10, alignItems: "center", background: C.card, border: "1px solid " + (servicos[i] ? C.primary : C.line), borderRadius: 12, padding: 14, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={!!servicos[i]} onChange={(e) => setServicos({ ...servicos, [i]: e.target.checked })} style={{ width: 17, height: 17, accentColor: C.primary }} />
                <div style={{ fontSize: 14 }}>{s}</div>
              </label>
            ))}
            <div style={{ background: C.primarySoft, border: "1px solid " + C.primary, borderRadius: 12, padding: 14, fontSize: 13, marginTop: 8 }}>
              Ao terminar, use <strong>Salvar ficha</strong> (fica registrada aqui no sistema) e <strong>Baixar .txt</strong> para arquivar no Drive da loja junto com a gravação da reunião.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
