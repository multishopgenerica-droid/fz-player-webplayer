# FZ Player Webplayer — Mapa da Costura (data-access ↔ código de ativação)

> Documento de planejamento. **Nada de lógica foi alterado ainda** — só identidade
> visual (logo, cores, textos). Este mapa mostra ONDE a nossa lógica de ativação
> por código se encaixa no esqueleto do IPTVnator.

## Princípio

O IPTVnator já separa **UI** de **dados** por trás de uma interface (`IXtreamDataSource`)
e de um objeto de credenciais (`XtreamCredentials`). Toda a aplicação (rails, dashboard,
player, EPG, favoritos) consome esse contrato. Logo, **só precisamos produzir
`{ serverUrl, username, password }` a partir do nosso código de ativação** — o resto
funciona sem tocar.

```
CÓDIGO DE ATIVAÇÃO (nosso)  ──►  resolve  ──►  XtreamCredentials { serverUrl, username, password }
                                                      │
                                                      ▼
                                          IXtreamDataSource (interface)
                                          ├─ PwaXtreamDataSource   (web)   ← É AQUI que ligamos
                                          └─ ElectronXtreamDataSource (desktop)
                                                      │
                                                      ▼
                              Store (XtreamStore) → UI (dashboard, rails, player, EPG)
```

## Os 4 pontos de costura

### 1. Tela de entrada — substituir o form cru pela NOSSA tela de ativação por QR
**Arquivo:** `libs/playlist/import/feature/src/lib/xtream-code-import/xtream-code-import.component.ts` (+ `.html`)

Hoje o form pede `serverUrl`, `username`, `password` (campos crus de Xtream) e no final dispara:

```ts
this.store.dispatch(
    PlaylistActions.addPlaylist({
        playlist: { title, serverUrl, username, password } as Playlist,
    })
);
```

**O que muda:** trocamos os 3 campos crus por **um campo de código de ativação + QR**
(a tela do FZ, mantida igual). O nosso fluxo resolve o código → credenciais → dispara
o MESMO `addPlaylist(...)`. O `dispatch` é a fronteira: a partir dele, nada mais muda.

> Decisão do dono (2026-06-10): **home de boas-vindas + login/ativação com QR ficam
> idênticos ao projeto FZ.** Portar a tela de lá pra cá neste componente.

### 2. Contrato de credenciais — o "formato de saída" da nossa lógica
**Arquivo:** `libs/portal/xtream/data-access/src/lib/services/xtream-api.service.ts`

```ts
export interface XtreamCredentials {
    serverUrl: string;
    username: string;
    password: string;
}
```

Esse é o **único objeto** que a nossa lógica de ativação precisa entregar. Se o nosso
backend devolve algo diferente (token, lista pré-resolvida, etc.), criamos um adaptador
que normaliza para esse shape.

### 3. Implementação web — onde plugamos a fonte de dados
**Arquivos:**
- `libs/portal/xtream/data-access/src/lib/data-sources/xtream-data-source.interface.ts` — a interface `IXtreamDataSource` + token `XTREAM_DATA_SOURCE`
- `libs/portal/xtream/data-access/src/lib/data-sources/pwa-xtream-data-source.ts` — implementação **web** (a que usamos)
- `libs/portal/xtream/data-access/src/lib/data-sources/index.ts` — factory `provideXtreamDataSource()`

A factory escolhe a implementação em runtime:

```ts
export function xtreamDataSourceFactory(): IXtreamDataSource {
    const runtime = inject(RuntimeCapabilitiesService);
    if (runtime.supportsXtreamSqliteDataSource) return inject(ElectronXtreamDataSource);
    return inject(PwaXtreamDataSource); // ← web cai aqui
}
```

**Opções de encaixe (do mais leve ao mais profundo):**
- **A) Manter `PwaXtreamDataSource` como está** e só alimentar credenciais resolvidas
  pelo nosso código. Menor esforço — o data-source segue falando Xtream normal, só
  que as credenciais vieram do nosso resolver. ✅ recomendado pra começar.
- **B) Criar `FzXtreamDataSource implements IXtreamDataSource`** e registrar no token
  `XTREAM_DATA_SOURCE`, caso a nossa lógica de listas seja bem diferente de Xtream cru.

### 4. Montagem de URLs de stream — onde as credenciais viram links de play
**Arquivo:** `libs/portal/xtream/data-access/src/lib/services/xtream-url.service.ts`

```ts
constructLiveUrl(c, id, fmt)   → `${c.serverUrl}/live/${c.username}/${c.password}/${id}.${fmt}`
constructVodUrl(c, vod)        → `${c.serverUrl}/movie/${c.username}/${c.password}/${id}.${ext}`
constructEpisodeUrl(c, ep)     → `${c.serverUrl}/series/${c.username}/${c.password}/${id}.${ext}`
```

Se o nosso backend usa o **mesmo padrão de URL Xtream**, não mexemos aqui (só as
credenciais mudam de origem). Se usa um padrão próprio (token na URL, proxy, etc.),
este é o único arquivo a adaptar.

## Resumo: o que tocar vs. o que herdar

| Camada | Arquivo | Ação |
|---|---|---|
| Tela de ativação/QR | `xtream-code-import.component.*` | **Substituir** pela tela FZ |
| Credenciais (contrato) | `xtream-api.service.ts` → `XtreamCredentials` | **Produzir** este shape |
| Fonte de dados web | `pwa-xtream-data-source.ts` / `index.ts` factory | **Alimentar** (A) ou **substituir** (B) |
| URLs de stream | `xtream-url.service.ts` | Herdar (ou adaptar se URL própria) |
| Dashboard, rails, player, EPG, favoritos | (resto do app) | **Herdar 100%** |

## Identidade FZ (já aplicada nesta sessão)

- Tokens de cor: `apps/web/src/fz-brand.scss` (fundo `#0E0E12`, accent `#1D4ED8`)
- Logo: `apps/web/src/assets/icons/fz-logo.png` (rail + hero + splash)
- Tema dark por padrão: `apps/web/src/app/app.component.ts` (`detectDarkMode`)
- Marca/textos: `index.html`, `i18n/en.json`, `i18n/pt.json`

Fonte da identidade: `FZ-Player-Android/shared/src/styles/tokens.css`
