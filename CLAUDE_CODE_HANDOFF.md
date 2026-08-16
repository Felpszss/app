# BeerRats — entrega para Claude Code

Este pacote contém o código-fonte integral do protótipo atualmente publicado.

## Como executar

Requisitos: Node.js 22.13 ou superior e npm.

```bash
npm install
npm run dev
```

Abra o endereço local exibido pelo terminal.

## Arquivos principais

- `app/page.tsx`: telas, catálogo de bebidas, navegação e interações do protótipo.
- `app/globals.css`: todo o estilo visual responsivo.
- `app/layout.tsx`: metadados e estrutura global.
- `db/`: estrutura preparada para Cloudflare D1/Drizzle.
- `package.json`: dependências e comandos.

## Estado atual

O app é um protótipo navegável em React/TypeScript. Foto, seleção de bebida,
quantidade, ranking, comunidades, perfil e configurações funcionam no frontend.
Os dados ainda são simulados e não existe backend de produção para contas,
persistência de check-ins, validação de fotos, ranking real ou moderação.

## Próxima tarefa sugerida ao Claude Code

Transforme este protótipo em um app full-stack, preservando exatamente o visual
e os fluxos atuais. Implemente autenticação, banco de dados, armazenamento de
fotos, comunidades, convites, check-ins, catálogo administrável, cálculo de
pontuação no servidor, ranking e moderação. Não confie em teor alcoólico,
quantidade ou pontos enviados pelo cliente. Inclua limites e avisos para não
incentivar consumo perigoso.

## Observação importante

O arquivo `.openai/hosting.json` identifica a publicação original no ChatGPT
Sites. Se o projeto for levado para outro provedor, ele pode ser ignorado.
