/**
 * Config de hosts (V2). Porte de FZ-Player/LG appConfig.ts.
 *
 *   apiOrigin     = https://ativos.fzplayer.com   (Socket.IO + /v1 quando gateway aí)
 *   connectOrigin = https://ativar.fzplayer.com   (QR /conectar + host exibido + gateway /v1 default)
 *
 * Resolução em camadas: config remoto (config.fzplayer.com) → cache (localStorage)
 * → fallback embutido. Em qualquer falha mantém o último bom.
 */

const DEFAULT_API_ORIGIN = atob('aHR0cHM6Ly9hdGl2b3MuZnpwbGF5ZXIuY29t'); // https://ativos.fzplayer.com
const DEFAULT_CONNECT_ORIGIN = atob('aHR0cHM6Ly9hdGl2YXIuZnpwbGF5ZXIuY29t'); // https://ativar.fzplayer.com
const CONFIG_URL = atob(
    'aHR0cHM6Ly9jb25maWcuZnpwbGF5ZXIuY29tL2FwcC1jb25maWcuanNvbg=='
); // https://config.fzplayer.com/app-config.json

const CACHE_KEY = 'fz:appConfig';

interface AppConfig {
    apiOrigin: string;
    connectOrigin: string;
    gatewayOrigin?: string;
    subscribeUrl?: string;
}

function normalizeOrigin(s: string): string {
    return s.trim().replace(/\/+$/, '');
}
function isValidOrigin(s: unknown): s is string {
    return typeof s === 'string' && /^https?:\/\/[^\s/]+/i.test(s);
}

function loadCachedOrDefault(): AppConfig {
    const out: AppConfig = {
        apiOrigin: normalizeOrigin(DEFAULT_API_ORIGIN),
        connectOrigin: normalizeOrigin(DEFAULT_CONNECT_ORIGIN),
    };
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
            const c = JSON.parse(raw) as Record<string, unknown>;
            if (isValidOrigin(c['apiOrigin']))
                out.apiOrigin = normalizeOrigin(c['apiOrigin']);
            if (isValidOrigin(c['connectOrigin']))
                out.connectOrigin = normalizeOrigin(c['connectOrigin']);
            if (isValidOrigin(c['gatewayOrigin']))
                out.gatewayOrigin = normalizeOrigin(c['gatewayOrigin']);
        }
    } catch {
        /* ignore */
    }
    return out;
}

let resolved: AppConfig = loadCachedOrDefault();

/** Busca o config remoto e atualiza estado + cache. Idempotente; chamar no boot. */
export async function loadAppConfig(timeoutMs = 4000): Promise<void> {
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), timeoutMs);
        const url =
            CONFIG_URL +
            (CONFIG_URL.includes('?') ? '&' : '?') +
            'v=' +
            (typeof performance !== 'undefined' ? Math.floor(performance.now()) : 0);
        const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) return;
        const json = (await res.json()) as Record<string, unknown>;
        const next: AppConfig = { ...resolved };
        const api = isValidOrigin(json['apiOrigin'])
            ? json['apiOrigin']
            : isValidOrigin(json['activateOrigin'])
              ? json['activateOrigin']
              : null;
        if (api) next.apiOrigin = normalizeOrigin(api);
        if (isValidOrigin(json['connectOrigin']))
            next.connectOrigin = normalizeOrigin(json['connectOrigin']);
        if (isValidOrigin(json['gatewayOrigin']))
            next.gatewayOrigin = normalizeOrigin(json['gatewayOrigin']);
        resolved = next;
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(resolved));
        } catch {
            /* ignore */
        }
    } catch {
        /* mantém cache/default — offline-tolerant */
    }
}

// ── Getters ───────────────────────────────────────────────────────────────
export function getApiOrigin(): string {
    return resolved.apiOrigin;
}
/** Gateway neutro /v1. Default = connectOrigin (ativar.fzplayer.com). */
export function getGatewayOrigin(): string {
    return resolved.gatewayOrigin || resolved.connectOrigin;
}
export function getSocketUrl(): string {
    return resolved.apiOrigin;
}
/** Endereço voltado ao usuário (QR + host exibido). */
export function getActivateOrigin(): string {
    return resolved.connectOrigin;
}
/** URL que vai no QR: {connectOrigin}/conectar */
export function getConnectUrl(): string {
    return resolved.connectOrigin + '/conectar';
}
