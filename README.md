# SEP — Controle de Certificações

Aplicação estática para organizar checklists, gembas, auditorias, certificações, responsáveis, pendências e andamento por filial.

## Funções

- cadastro de controles e checklists;
- separação por rotina, filial e ciclo;
- responsável, status, prioridade, prazo e percentual de progresso;
- registro de quem está devendo retorno;
- registro de bloqueios, evidências e próximas ações;
- dashboard com indicadores, distribuição por status, progresso por rotina e comparação entre filiais;
- visualização em cards ou tabela;
- impressão do dashboard para apresentação aos gestores;
- exportação de backup JSON;
- restauração de backup;
- exportação CSV para Excel;
- funcionamento responsivo e offline básico.

## Armazenamento

O projeto não usa servidor ou banco de dados. Os dados cadastrados ficam no `localStorage` do navegador e não são enviados automaticamente para o GitHub.

Use **Dados e backup → Baixar backup JSON** periodicamente. Ao trocar de navegador ou computador, restaure esse arquivo no aplicativo.

## GitHub Pages

O workflow `.github/workflows/pages.yml` publica o conteúdo do branch `main`. No repositório, configure **Settings → Pages → Source → GitHub Actions** caso ainda não esteja habilitado.

Endereço esperado após a publicação:

`https://aruanmf446-hub.github.io/SEP/`
