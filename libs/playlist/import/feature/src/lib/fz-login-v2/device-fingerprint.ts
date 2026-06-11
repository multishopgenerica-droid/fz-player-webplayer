/**
 * Fingerprint do dispositivo (display + valor do QR). Porte mínimo de
 * PROJETO-TVS-APP/LG/app/src/services/deviceId.ts (parte web/fallback).
 *
 * No navegador não há LGUDID — gera um id MAC-style estável, persistido em
 * localStorage. É o MESMO valor mostrado como "ID:" e embutido no QR.
 */

const FP_KEY = 'fz_device_fingerprint';
const MAC_REGEX = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;

let cache: string | null = null;

function generateFakeMac(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    bytes[0] = (bytes[0] | 0x02) & 0xfe; // locally administered
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(':');
}

export function getDeviceFingerprint(): string {
    if (cache && MAC_REGEX.test(cache)) return cache;
    try {
        const stored = localStorage.getItem(FP_KEY);
        if (stored && MAC_REGEX.test(stored)) {
            cache = stored;
            return stored;
        }
    } catch {
        /* localStorage indisponível */
    }
    const mac = generateFakeMac();
    try {
        localStorage.setItem(FP_KEY, mac);
    } catch {
        /* ignore */
    }
    cache = mac;
    return mac;
}

/** Fingerprint canônico (string opaca) — trim + lowercase. */
export function getCanonicalFingerprint(): string {
    return getDeviceFingerprint().trim().toLowerCase();
}

/** Exibição = o mesmo valor canônico. */
export function getDeviceFingerprintDisplay(): string {
    return getCanonicalFingerprint();
}

// ── deviceUuid (UUID v4 persistido) ──────────────────────────────────────────
const UUID_KEY = 'fz_device_uuid';
let uuidCache: string | null = null;

function generateUuidV4(): string {
    const c = crypto as unknown as { randomUUID?: () => string };
    if (typeof c?.randomUUID === 'function') return c.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return (
        hex.slice(0, 8) +
        '-' +
        hex.slice(8, 12) +
        '-' +
        hex.slice(12, 16) +
        '-' +
        hex.slice(16, 20) +
        '-' +
        hex.slice(20)
    );
}

export function getDeviceUuid(): string {
    if (uuidCache) return uuidCache;
    try {
        const cached = localStorage.getItem(UUID_KEY);
        if (cached) {
            uuidCache = cached;
            return cached;
        }
    } catch {
        /* ignore */
    }
    const uuid = generateUuidV4();
    try {
        localStorage.setItem(UUID_KEY, uuid);
    } catch {
        /* ignore */
    }
    uuidCache = uuid;
    return uuid;
}

/** User-Agent customizado pro POST /v1/activate (campo `userAgent`). */
export function getUserAgent(appVersion: string): string {
    return `FZPlayer-Web/${appVersion}`;
}

/** Identificação da plataforma (campo `platformVersion`). */
export function getPlatformVersion(): string {
    return typeof navigator !== 'undefined'
        ? `Web-${navigator.platform || 'browser'}`
        : 'Web';
}
