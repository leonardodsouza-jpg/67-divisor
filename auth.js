/* 67 Divisor — login por grupo + sincronização com o Supabase.
   Ideia: o "nome do grupo" vira um e-mail interno (ex.: amigos-do-churrasco@67divisor.app)
   e a senha é a senha do grupo. Ninguém precisa de e-mail de verdade. */
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const configurado = cfg.url && cfg.anonKey && !String(cfg.url).includes("COLE_AQUI");
  const naLogin = /login\.html$/.test(location.pathname);
  const CHAVE_DADOS = "67divisor-v5", PENDENTE = "67divisor-pendente";
  const sb = configurado && window.supabase ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  const slug = nome => nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const emailDe = nome => slug(nome) + "@67divisor.app";

  const traduzir = msg => {
    const m = String(msg || "");
    if (/invalid login/i.test(m)) return "Nome do grupo ou senha incorretos.";
    if (/already registered|already been registered/i.test(m)) return "Já existe um grupo com esse nome. Escolha outro ou entre.";
    if (/at least \d+ char|weak|short/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
    if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Espere um pouco e tente de novo.";
    if (/network|fetch/i.test(m)) return "Sem conexão com a internet.";
    return "Algo deu errado: " + m;
  };

  const Auth = {
    configurado, slug,
    async sessao() { if (!sb) return null; const { data } = await sb.auth.getSession(); return data.session; },
    async entrar(nome, senha) {
      const { error } = await sb.auth.signInWithPassword({ email: emailDe(nome), password: senha });
      if (error) throw new Error(traduzir(error.message));
    },
    async criar(nome, senha) {
      const { data, error } = await sb.auth.signUp({ email: emailDe(nome), password: senha, options: { data: { nome_grupo: nome.trim() } } });
      if (error) throw new Error(traduzir(error.message));
      if (!data.session) throw new Error("O Supabase ainda exige confirmação por e-mail. Desligue 'Confirm email' em Authentication > Providers > Email.");
    },
    async sair() {
      try { await Nuvem.enviarAgora(); } catch (e) {}
      if (sb) await sb.auth.signOut();
      localStorage.removeItem(CHAVE_DADOS); localStorage.removeItem(PENDENTE);
      location.replace("login.html");
    }
  };

  /* ---- Sincronização dos dados do churrasco ---- */
  let timer = null, versao = 0, ultimo = null;
  const status = txt => { const el = document.getElementById("status-nuvem"); if (el) el.textContent = txt; };
  const Nuvem = {
    async carregar() {
      const s = await Auth.sessao(); if (!s) throw new Error("sem sessão");
      if (localStorage.getItem(PENDENTE) === "1") return null; // há alteração local ainda não enviada
      const { data, error } = await sb.from("dados_grupo").select("estado").eq("user_id", s.user.id).maybeSingle();
      if (error) throw error;
      return data ? data.estado : null;
    },
    salvar(estado) {
      ultimo = JSON.stringify(estado); versao++;
      localStorage.setItem(PENDENTE, "1"); status("Salvando…");
      clearTimeout(timer); timer = setTimeout(() => Nuvem.enviarAgora().catch(() => {}), 500);
    },
    async enviarAgora() {
      clearTimeout(timer);
      if (localStorage.getItem(PENDENTE) !== "1" || ultimo === null) return;
      const minha = versao;
      try {
        const s = await Auth.sessao(); if (!s) throw new Error("sem sessão");
        const { error } = await sb.from("dados_grupo").upsert({ user_id: s.user.id, estado: JSON.parse(ultimo), atualizado_em: new Date().toISOString() });
        if (error) throw error;
        if (minha === versao) localStorage.removeItem(PENDENTE);
        status("Salvo na nuvem ✓");
      } catch (e) { status("Sem conexão: salvo só neste aparelho"); throw e; }
    },
    avisar: status
  };
  window.Auth = Auth; window.Nuvem = sb ? Nuvem : null;

  /* ---- Proteção das páginas ---- */
  if (naLogin) return;
  document.documentElement.style.visibility = "hidden";
  (async () => {
    const s = await Auth.sessao();
    if (!s) { location.replace("login.html"); return; }
    document.documentElement.style.visibility = "";
    document.addEventListener("DOMContentLoaded", () => {
      const topo = document.querySelector(".topo"); if (!topo) return;
      const nome = (s.user.user_metadata && s.user.user_metadata.nome_grupo) || "Meu grupo";
      const caixa = document.createElement("div"); caixa.className = "conta";
      caixa.innerHTML = '<span class="conta-nome"></span><span id="status-nuvem" class="conta-status" aria-live="polite"></span><button type="button" class="secundario" id="btn-sair">Sair</button>';
      caixa.querySelector(".conta-nome").textContent = "Grupo: " + nome;
      topo.appendChild(caixa);
      document.getElementById("btn-sair").addEventListener("click", Auth.sair);
    });
  })();
})();
