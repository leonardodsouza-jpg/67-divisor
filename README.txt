67 DIVISOR — PROJETO EM TRÊS PÁGINAS
=====================================

ARQUIVOS
- index.html: cadastro e gestão de pessoas
- produtos.html: cadastro, edição e divisão de produtos/despesas
- pagamentos.html: resultados, saldos, mural e exportação
- script.js: lógica e armazenamento compartilhados
- style.css: identidade visual compartilhada

COMO EXECUTAR
1. Instale o Node.js 20 ou mais recente.
2. Na pasta do projeto, execute: npm install
3. Configure DATABASE_URL no arquivo .env.local (ou no ambiente do servidor).
   O valor é obtido no Neon Console; nunca o exponha em arquivos enviados ao navegador.
4. Execute: npm start
5. Abra http://localhost:3000 e navegue entre Pessoas, Produtos e Pagamentos.

NEON
O servidor usa @neondatabase/serverless para acessar o Postgres pela API HTTP do Neon.
Na inicialização, cria as tabelas divisor_groups, divisor_group_data e divisor_sessions.
Senhas são armazenadas com scrypt; sessões ficam em cookies HttpOnly e os dados de cada
grupo são isolados no servidor. .env.local é local e não deve ser publicado.

Para validar sintaxe e build: npm run build

PUBLICAÇÃO
Publique o servidor Node.js, os arquivos do projeto e as dependências. Configure DATABASE_URL
como variável de ambiente no provedor de hospedagem e defina NODE_ENV=production para
habilitar cookies Secure. Não publique .env.local. O servidor usa a porta PORT fornecida
pelo provedor (ou 3000 localmente). A fonte Zilla Slab é carregada do Google Fonts; sem
internet, o navegador usa fontes alternativas.

DADOS E MIGRAÇÃO
Os dados continuam em cache local pela chave 67divisor-v5 e são sincronizados no Neon
por grupo. A estrutura original {pessoas, itens} e os campos existentes são mantidos.
Dados locais existentes são usados quando um grupo ainda não tem dados no servidor.
Faça backup antes de limpar dados ou trocar de navegador.

OBSERVAÇÃO
O exemplo pronto substitui os dados existentes após confirmação. "Limpar tudo" também
solicita confirmação. A taxa de 15%, pesos de consumo, divisão em centavos, adiantamentos,
pagamentos, mural, resumo WhatsApp e exportação TXT permanecem implementados.
