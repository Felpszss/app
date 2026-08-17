# BeerRats — demo clicável

`beerrats-demo.html` é um protótipo autocontido (HTML/CSS/JS puro, sem build,
sem dependências) que reproduz a interface e as regras de negócio do app
real — pontuação por teor alcoólico, limite de 4000 ml por check-in, cooldown
de 10 min entre check-ins, teto diário de 120 pontos no ranking, criação e
edição de eventos com prêmio, etc.

Ele **não** fala com o backend real (D1/R2/ChatGPT sign-in). Todos os dados
(comunidades, check-ins, eventos) ficam em memória no navegador de quem abrir
— recarregar a página reseta tudo, e cada pessoa que abre o arquivo vê seu
próprio estado isolado, não um estado compartilhado entre pessoas.

## Como abrir

Baixe `beerrats-demo.html` e abra direto no navegador (duplo clique, ou
`file://.../beerrats-demo.html`), ou sirva a pasta com qualquer servidor
estático, por exemplo:

```bash
npx serve demo
# ou
python3 -m http.server --directory demo 8080
```

Funciona em qualquer navegador moderno, desktop ou celular.
