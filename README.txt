67 DIVISOR — PROJETO EM TRÊS PÁGINAS
=====================================

ARQUIVOS
- index.html: cadastro e gestão de pessoas
- produtos.html: cadastro, edição e divisão de produtos/despesas
- pagamentos.html: resultados, saldos, mural e exportação
- script.js: lógica e armazenamento compartilhados
- style.css: identidade visual compartilhada

COMO EXECUTAR
1. Extraia a pasta 67-Divisor.
2. Abra index.html em um navegador moderno (Chrome, Edge, Firefox).
3. Navegue pelo menu superior entre Pessoas, Produtos e Pagamentos.

PUBLICAÇÃO
Envie todos os arquivos da pasta 67-Divisor para a mesma pasta do seu site/servidor.
Mantenha os nomes dos arquivos e a estrutura. A página inicial será index.html.
Não é necessário instalar dependências. A fonte Zilla Slab é carregada do Google Fonts;
sem internet, o navegador usa fontes alternativas.

DADOS E MIGRAÇÃO
Os dados são salvos localmente no navegador pela chave 67divisor-v5.
A estrutura original {pessoas, itens} e os campos existentes são mantidos.
A primeira abertura lê os dados já gravados nessa chave e continua a utilizá-los.
Os dados ficam no navegador/dispositivo em que foram cadastrados; localStorage não
sincroniza automaticamente entre dispositivos ou navegadores. Faça backup antes de
limpar dados ou trocar de navegador.

OBSERVAÇÃO
O exemplo pronto substitui os dados existentes após confirmação. "Limpar tudo" também
solicita confirmação. A taxa de 15%, pesos de consumo, divisão em centavos, adiantamentos,
pagamentos, mural, resumo WhatsApp e exportação TXT permanecem implementados.
