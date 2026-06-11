/**
 * Cliente da camada de dados do gateway neutro /v1 (V2).
 *
 * Auto-contido (lê token + gateway do localStorage gravados pelo login V2 em
 * import/feature) pra NÃO criar dependência cross-lib (evita ciclo nx). Mapeia
 * `/v1/library` e as URLs `/v1/stream/{kind}/{id}?t=token` para os tipos Xtream
 * que o IPTVnator já consome.
 *
 * Contrato: Desktop/GATEWAY-NEUTRO-V1-MASTER-CROSS-TV.md.
 */

const TOKEN_KEY = 'fz:v1:token';
const CONFIG_KEY = 'fz:appConfig';
const DEFAULT_CONNECT_ORIGIN = 'https://ativar.fzplayer.com';

export function getV1Token(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

/** Origin do gateway (gatewayOrigin || connectOrigin do appConfig cache). */
function gatewayOrigin(): string {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) {
            const c = JSON.parse(raw) as Record<string, unknown>;
            const o = c['gatewayOrigin'] || c['connectOrigin'];
            if (typeof o === 'string' && /^https?:\/\//.test(o)) {
                return o.replace(/\/+$/, '');
            }
        }
    } catch {
        /* ignore */
    }
    return DEFAULT_CONNECT_ORIGIN;
}

export function v1Base(): string {
    return gatewayOrigin() + '/v1';
}

/** Detecta se a playlist ativa é do gateway V2 (serverUrl == gatewayOrigin). */
export function isV1Playlist(serverUrl: string | undefined | null): boolean {
    if (!serverUrl) return false;
    return serverUrl.replace(/\/+$/, '') === gatewayOrigin();
}

// ── Wire shapes /v1 ─────────────────────────────────────────────────────────
export interface V1Category {
    id: number;
    name: string;
}
export interface V1Item {
    id: number;
    title: string;
    image?: string;
    kind: 'live' | 'vod' | 'series';
    categoryId: number;
    year?: string;
    rating?: string;
}
export interface V1Library {
    categories: V1Category[];
    items: V1Item[];
}

// Detalhe de item (/v1/item/{kind}/{id}) — espelha o contrato §2.3.
export interface V1ItemDetail {
    id: number;
    title: string;
    overview?: string;
    image?: string;
    year?: number;
    runtimeSecs?: number;
    rating?: string;
    genres?: string;
    cast?: string;
    director?: string;
}
export interface V1Episode {
    id: number;
    number: number;
    title: string;
    image?: string;
    runtimeSecs?: number;
    overview?: string;
}
export interface V1Season {
    number: number;
    episodes: V1Episode[];
}
export interface V1SeriesDetail extends V1ItemDetail {
    seasons?: V1Season[];
}

// EPG (/v1/epg/{id}) — §2.6. start/end em unix seconds; description já limpa.
export interface V1Program {
    title: string;
    start: number;
    end: number;
    description?: string;
}
export interface V1Epg {
    now?: V1Program;
    next?: V1Program[];
}

async function v1Get<T>(path: string, timeoutMs = 20000): Promise<T> {
    const token = getV1Token();
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(v1Base() + path, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: ctrl.signal,
            cache: 'no-store',
        });
        if (!res.ok) {
            throw new Error(`v1 ${path} → ${res.status}`);
        }
        return (await res.json()) as T;
    } finally {
        clearTimeout(tid);
    }
}

// Memo curto do /v1/library (categorias + itens batem 1×).
const LIB_TTL_MS = 30_000;
const libCache = new Map<string, { at: number; p: Promise<V1Library> }>();

export function fetchV1Library(
    kind: 'live' | 'vod' | 'series'
): Promise<V1Library> {
    const now =
        typeof performance !== 'undefined' ? performance.now() : 0;
    const hit = libCache.get(kind);
    if (hit && now - hit.at < LIB_TTL_MS) return hit.p;
    const p = v1Get<V1Library>(`/library?kind=${kind}`).catch((err) => {
        libCache.delete(kind);
        throw err;
    });
    libCache.set(kind, { at: now, p });
    return p;
}

export function clearV1LibraryCache(): void {
    libCache.clear();
}

/** Detalhe de filme/série: /v1/item/{kind}/{id} (§2.3, kind-aware). */
export function fetchV1Item(
    kind: 'vod',
    id: number | string
): Promise<V1ItemDetail>;
export function fetchV1Item(
    kind: 'series',
    id: number | string
): Promise<V1SeriesDetail>;
export function fetchV1Item(
    kind: 'vod' | 'series',
    id: number | string
): Promise<V1ItemDetail | V1SeriesDetail> {
    return v1Get<V1ItemDetail | V1SeriesDetail>(`/item/${kind}/${id}`);
}

/** EPG now/next de um canal live: /v1/epg/{liveId} (§2.6). */
export function fetchV1Epg(id: number | string): Promise<V1Epg> {
    return v1Get<V1Epg>(`/epg/${id}`);
}

/** URL de stream tocável: {v1Base}/stream/{kind}/{id}?t={token}. Token na query
 *  (elementos de mídia não setam Authorization no fetch do manifesto). */
export function buildV1StreamUrl(
    kind: 'live' | 'vod' | 'episode',
    id: number | string
): string {
    const t = getV1Token();
    const base = `${v1Base()}/stream/${kind}/${id}`;
    return t ? `${base}?t=${encodeURIComponent(t)}` : base;
}
