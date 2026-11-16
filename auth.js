/* Same-origin authentication and group data API. */
(function () {
  const naLogin = /login\.html$/.test(location.pathname);
  const CHAVE_DADOS = "67divisor-v5";
  const PENDENTE = "67divisor-pendente";
  let timer = null, versao = 0, ultimo = null;

  async function requisicao(url, opcoes) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...opcoes,
      headers: {
        ...(opcoes && opcoes.body ? { "Content-Type": "application/json" } : {}),
        ...(opcoes && opcoes.headers ? opcoes.headers : {})
      }
    });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const error = new Error(body && body.error ? body.error : "Não foi possível concluir a solicitação.");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  const slug = nome => String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const Auth = {
    configurado: true,
    slug,
    async sessao() {
      try {
        return await requisicao("/api/auth/session");
      } catch (error) {
        if (error.status === 401) return null;
        throw error;
      }
    },
    async entrar(nome, senha) {
      await requisicao("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ name: nome, password: senha })
      });
    },
    async criar(nome, senha) {
      await requisicao("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: nome, password: senha })
      });
    },
    async sair() {
      await Nuvem.enviarAgora();
      await requisicao("/api/auth/logout", { method: "POST" });
      localStorage.removeItem(CHAVE_DADOS);
      localStorage.removeItem(PENDENTE);
      location.replace("login.html");
    }
  };

  const status = texto => {
    const el = document.getElementById("status-nuvem");
    if (el) el.textContent = texto;
  };
  const Nuvem = {
    async carregar() {
      if (localStorage.getItem(PENDENTE) === "1") return null;
      const response = await requisicao("/api/data");
      return response.state;
    },
    salvar(estado) {
      ultimo = JSON.stringify(estado);
      versao++;
      localStorage.setItem(PENDENTE, "1");
      status("Salvando…");
      clearTimeout(timer);
      timer = setTimeout(() => {
        Nuvem.enviarAgora().catch(error => {
          status("Erro ao salvar na nuvem; alterações mantidas neste aparelho.");
          console.error("Could not save group data to Neon.", error);
        });
      }, 500);
    },
    async enviarAgora() {
      clearTimeout(timer);
      if (localStorage.getItem(PENDENTE) !== "1" || ultimo === null) return;
      const minha = versao;
      const estado = JSON.parse(ultimo);
      await requisicao("/api/data", {
        method: "PUT",
        body: JSON.stringify({ state: estado })
      });
      if (minha === versao) localStorage.removeItem(PENDENTE);
      status("Salvo na nuvem ✓");
    },
    avisar: status
  };
  window.Auth = Auth;
  window.Nuvem = Nuvem;

  if (naLogin) return;
  document.documentElement.style.visibility = "hidden";
  (async () => {
    try {
      const session = await Auth.sessao();
      if (!session) {
        location.replace("login.html");
        return;
      }
      document.documentElement.style.visibility = "";
      document.addEventListener("DOMContentLoaded", () => {
        const topo = document.querySelector(".topo");
        if (!topo) return;
        const caixa = document.createElement("div");
        caixa.className = "conta";
        caixa.innerHTML = '<span class="conta-nome"></span><span id="status-nuvem" class="conta-status" aria-live="polite"></span><button type="button" class="secundario" id="btn-sair">Sair</button>';
        caixa.querySelector(".conta-nome").textContent = "Grupo: " + session.group.name;
        topo.appendChild(caixa);
        document.getElementById("btn-sair").addEventListener("click", () => {
          Auth.sair().catch(error => {
            status("Não foi possível sair: " + error.message);
            console.error("Could not sign out.", error);
          });
        });
      });
    } catch (error) {
      document.documentElement.style.visibility = "";
      console.error("Could not verify the current session.", error);
      document.addEventListener("DOMContentLoaded", () => {
        const aviso = document.createElement("p");
        aviso.className = "aviso";
        aviso.setAttribute("role", "alert");
        aviso.textContent = "Não foi possível conectar ao servidor. Atualize a página para tentar novamente.";
        document.querySelector("main")?.prepend(aviso);
      });
    }
  })();
})();
