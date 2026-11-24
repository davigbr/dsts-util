# Grafo de Digivoluções — Digimon Story: Time Stranger

SPA de arquivo único que mostra os **475 Digimon** do jogo como um grafo navegável: cada nó é uma ficha (stats Lv.99, tipo, personalidade base, traits, skills) e cada aresta é uma digivolução com seus requisitos.

**Abrir:** `dist/index.html` (duplo clique; não precisa de servidor nem internet).

## Como navegar

| Ação | Efeito |
|---|---|
| clique num nó | abre a ficha e destaca a linhagem inteira (ancestrais + descendentes) |
| passar o mouse | realce da linhagem + tooltip com HP/DEF/SPI |
| roda do mouse | zoom no cursor |
| arrastar | mover |
| duplo clique num nó | centralizar e aproximar |
| `0` | reenquadrar · `+` / `-` zoom · `/` busca · `Esc` fecha a ficha |
| `#/d/nome-do-digimon` | link direto para a ficha (ex.: `#/d/jesmon`) |

## Filtros (painel esquerdo)

Como os chips se comportam:

- Todos começam marcados. **1º clique** isola o valor; **cliques seguintes somam** (Data + Vaccine), e clicar num chip já marcado o remove.
- Se sobrar nenhum, volta a mostrar todos.
- **Shift ou ⌘ + clique** alterna sem isolar, para combinar direto.
- Vale igual para atributo e geração — dá para escolher Champion + Ultimate, por exemplo.
- Personalidade é multi-seleção direta (nenhuma marcada = todas).
- Os filtros ativos aparecem resumidos no cabeçalho como chips com `×`, que remove só aquele critério.


- **Atributo** (Data, Vaccine, Virus, Free, Variable, Unknown, No Data) — a legenda também filtra.
- **Geração** (Bebê I → Mega+).
- **Personalidade** e **rank mínimo** (opcionais, recolhidos).
- **Stats mínimos** (HP, SP, ATK, DEF, INT, SPI, SPD) — recolhido.
- **Texto livre** que busca em nome, tipo, atributo, geração, traits e nas **skills e seus efeitos** (`counter`, `taunt`, `heal`…).
- Aba **Lista**: os filtrados agrupados por geração.

## Vista

- **Cor por**: atributo, geração, personalidade ou um stat (mapa de calor).
- **Tamanho do nó**: fixo, HP, ATK, DEF, SPI ou “casco” (HP × DEF+SPI).
- **Rótulos**: automático (por zoom), só na linhagem, todos ou nenhum.
- **Arestas**: só ao destacar (padrão, limpo), todas as digivoluções, ou ocultar.
- **Layout**: camadas por geração · só a linhagem do selecionado · força (explorar).

O estado dos filtros e da vista fica salvo em `localStorage`.

## Força geral (tier) — duas escalas

Todo Digimon recebe `tier` (S/A/B/C/D), `pow` (poder), `ut` (utilidade), `sc` (score) e `rk` (posição 1–475), calculados no build (`score_nodes` em `scripts/build.py`):

- **Poder** = 45% total dos stats Lv.99 + 30% casco (HP×(DEF+SPI)) + 15% melhor eixo ofensivo (ATK ou INT) + 10% SPD, tudo em percentil sobre os 475.
- **Utilidade** = skills de suporte (buff/debuff/cura/status) + 1,5× type-killers + 2× shred de resistência, em percentil.
- **Score** = 0,6 × poder + 0,4 × utilidade. **Tiers**: S = top 8%, A = 8–25%, B = 25–50%, C = 50–78%, D = resto.

O mesmo cálculo roda **duas vezes**: sobre os 475 (escala do roster) e **dentro de cada geração** (percentis recalculados só entre os pares). Assim um Champion é comparado com Champions — `gtier`/`grk`/`gcount` guardam a versão relativa; `tier`/`rk` a global. A ficha, a lista e o tooltip usam a **relativa à geração** como principal e mostram a do roster como linha secundária.

Na interface: filtro **Força (tier)** com escopo **na geração / roster**, `Vista → Cor → Força (tier)`, `Vista → Tamanho → Força (score)`, ordenação **Maior força** na lista e badge com posição na ficha. `ranking-forca.md` tem a tabela completa.

## Rotas de evolução

Botão **Rotas** no cabeçalho (ou tecla `R`, ou "Ver rotas de evolução" no painel do time). Tela própria em tela cheia: grafo de 3 trilhas (hoje → alvo) + painel de métricas. Recalcula sozinho quando o time muda.

Para cada membro, o app faz BFS pelos descendentes (até 5 passos), mantém os 16 alvos de maior score e avalia todas as combinações (16³ ≈ 4 mil, ~15 ms). Quatro algoritmos, cada um com sua escala:

- **Triângulo** — 42% cobertura do triângulo de atributos + 13% neutro como coringa + 18% vantagem ofensiva + 12% não empilhar fraqueza + 15% score médio.
- **Blindagem** — 40% soma das fraquezas repetidas (minimax) + 22% pior caso + 23% resistências cobertas + 15% score médio.
- **Ofensiva** — 44% elementos de ataque cobertos + 20% atributo que fura + 16% triângulo + 20% score médio.
- **Poder** — 62% score médio + 18% triângulo + 20% piso de exposição, com penalidade por empilhar fraqueza.

Guardas comuns a todos: nenhuma rota pode baixar a cobertura do triângulo abaixo do possível (45 pts por atributo faltante) nem aumentar a fraqueza repetida em relação ao time atual (10 pts por membro extra exposto). As rotas são deduplicadas exigindo diferença em **pelo menos 2 membros**, então cada aba mostra um caminho realmente distinto.

### Interação e explicações

- **Arrastar** move o grafo; **roda** dá zoom no cursor; botões − ⤢ + no canto; `k` mínimo de 0,66 (abaixo disso navega em vez de encolher).
- **Clique** num nó seleciona (anel branco) e abre um card no painel com atributo, tier, posição, fraquezas/resistências e botões *Abrir ficha* / *＋ Time*; **duplo clique** abre a ficha direto.
- **Hover** mostra tooltip com nome, geração, atributo, tier e posição.
- Botão **？ Como funciona** abre um guia com: o que a tela faz, os quatro algoritmos (explicação + pesos), o significado de cada número e como navegar. As abas também têm tooltip com a explicação longa, e cada métrica do painel tem ícone `?` com tooltip. O painel compara **hoje → alvo** (triângulo, pior elemento, elementos de ataque, score médio) e lista os requisitos de cada passo (rank + stats). "Marcar no grafo" deixa um anel tracejado violeta nos alvos; o time fica com anel dourado.

## Comparar dois Digimon

Botão **Comparar** no cabeçalho (ou tecla `C`), ou **⇄ Comparar** na ficha de qualquer Digimon. Tela própria com dois slots: busca por nome em cada lado, botões ⇄ (trocar), × (limpar) e ↗ (abrir a ficha).

A tabela mostra geração, atributo, **tier na geração** (e o do roster quando as gerações diferem), os 7 stats com barras na mesma escala, delta colorido e seta de vantagem, fraquezas/resistências lado a lado (incluindo "só o A é fraco" / "só o B é fraco"), skills assinatura com elemento e custo, e um aviso quando a fraqueza é comum aos dois. O cabeçalho resume quem ganha quantos stats e, em gerações diferentes, lembra que o tier exibido é o relativo.

## Construtor de time

Botão **Time** no cabeçalho (ou tecla `T` com um Digimon selecionado). Até 3 membros; o time fica salvo.

O painel cruza o time em dois eixos:

- **Triângulo de atributos** — para cada atributo inimigo (Vaccine/Data/Virus): quantos membros batem com ×1,5 e quantos levam ×1,5.
- **Elementos que o time ataca** — as 11 afinidades, marcando quais os golpes do time cobrem (e quais faltam).
- **O que fura o time** — elementos em que algum membro leva ×1,5, com destaque quando a fraqueza se repete em 2+ membros.
- **Por membro** — vantagem de atributo, elementos de ataque, fraquezas, resistências.
- **Leitura rápida** — avisos automáticos (atributo sem cobertura, fraqueza empilhada, elemento descoberto).

Os membros do time ganham anel dourado no grafo.

## Artes

Cada nó do grafo é a arte do Digimon recortada em círculo, com anel na cor do atributo. A arte também aparece no tooltip, na lista, no painel (retrato 84px) e nas linhas de digivolução. Em `Vista → Ícones` dá para fixar em "Sempre" ou desligar.

As 475 imagens vêm do Game8, redimensionadas para 144 px em WebP (~1,2 MB) e embutidas como base64 — por isso o arquivo tem ~2,3 MB e continua funcionando offline.

## Dados

Cada ficha traz stats Lv.99, tipo, personalidade base, traits, skills (com **elemento**, SP, tipo e efeito), **fraquezas/resistências de atributo e dos 11 elementos**, a linha de digivolução com requisitos e a descrição do Field Guide.

Fonte: fichas do Game8 (`/archives/<id>`), lidas via relay `r.jina.ai`. Stats são de **nível 99 com Agent Skills maximizados** — comparáveis entre si, não são stats de campanha. Arestas vindas de de-digivolução aparecem como “via de-digivolução” quando a página não traz o requisito explícito.

## Pipeline

```
scripts/fetch_all.py      # HTML direto (quando a rede deixa)
scripts/fetch_md.py       # relay r.jina.ai -> pages_md/*.md (resumível)
scripts/fetch_parallel.py # fila com retry, respeitando ~20 req/min
scripts/parse_md.py       # markdown -> data/digimon_md.json
scripts/parse.py          # HTML -> data/digimon.json
scripts/fetch_img.py      # artes via wsrv.nl -> img/*.webp (144px)
scripts/parse_md.py + parse.py   # incluem as tabelas de resistência (△ / ⭘ / ╳ / -)
scripts/build.py          # junta tudo (inclui as artes em base64) em dist/index.html
```

Dados brutos em `data/` (`catalog.json` = catálogo dos 475, `digimon_md.json` = fichas parseadas), páginas cruas em `pages_md/`.

## Repositório

`github.com/davigbr/dsts-util` — `python3 scripts/build.py` gera `dist/index.html`. `pages/` e `pages_md/` (HTML bruto do Game8, ~85 MB) ficam fora do git; tudo o mais é versionado, inclusive `data/`, `img/` e o `dist/`.
