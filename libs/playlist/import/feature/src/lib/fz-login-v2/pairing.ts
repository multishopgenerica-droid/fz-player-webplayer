/**
 * Pareamento via QR Code (Socket.IO). Porte de
 * FZ-Player/LG src/services/pairing.ts (spec FZ-PLAYER-FLUXO-LOGIN-V2 §6).
 *
 * App conecta no Socket.IO em modo pre-auth (sem código) → usuário escaneia QR
 * no celular → preenche credenciais no site → backend emite `source-ready` →
 * app auto-ativa via /v1/activate (code) ou /v1/activate-creds (dns).
 */

import { io, type Socket } from 'socket.io-client';
import { getCanonicalFingerprint } from './device-fingerprint';
import { getSocketUrl } from './app-config';

const SOCKET_PATH = '/api/socket.io';

export interface SourceReadyPayload {
    code?: string;
    dns?: string;
    credentials: { username: string; password: string };
    displayName?: string;
}

export interface PairingHandlers {
    onSourceReady: (p: SourceReadyPayload) => void;
    onRevoked?: (reason: string) => void;
    onForceLogout?: (reason: string) => void;
    onLicenseExpired?: (reason: string) => void;
    onAuthError?: (code: string) => void;
    onStatus?: (status: PairingStatus) => void;
}

export type PairingStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'disconnected'
    | 'error';

export class PairingSession {
    private socket: Socket | null = null;
    private disposed = false;
    private sourceReadyFired = false;

    constructor(
        private readonly handlers: PairingHandlers,
        private readonly appVersion: string
    ) {}

    connect(): void {
        if (this.disposed) return;
        this.handlers.onStatus?.('connecting');
        try {
            this.socket = io(getSocketUrl(), {
                path: SOCKET_PATH,
                transports: ['websocket', 'polling'],
                auth: {
                    fingerprint: getCanonicalFingerprint(),
                    appVersion: this.appVersion,
                },
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000,
            });

            this.socket.on('connect', () =>
                this.handlers.onStatus?.('connected')
            );
            this.socket.on('disconnect', () => {
                if (!this.disposed) this.handlers.onStatus?.('disconnected');
            });
            this.socket.on('connect_error', () => {
                if (!this.disposed) this.handlers.onStatus?.('error');
            });

            this.socket.on('source-ready', (raw: unknown) => {
                if (this.sourceReadyFired) return;
                const p = parseSourceReady(raw);
                if (p) {
                    this.sourceReadyFired = true;
                    this.handlers.onSourceReady(p);
                }
            });
            this.socket.on('revoked', (raw: unknown) =>
                this.handlers.onRevoked?.(extractReason(raw))
            );
            this.socket.on('force-logout', (raw: unknown) =>
                this.handlers.onForceLogout?.(extractReason(raw))
            );
            this.socket.on('license-expired', (raw: unknown) =>
                this.handlers.onLicenseExpired?.(extractReason(raw))
            );
            this.socket.on('auth-error', (raw: unknown) =>
                this.handlers.onAuthError?.(extractAuthErrorCode(raw))
            );
        } catch {
            this.handlers.onStatus?.('error');
        }
    }

    disconnect(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.socket) {
            try {
                this.socket.removeAllListeners();
                this.socket.disconnect();
            } catch {
                /* ignore */
            }
            this.socket = null;
        }
        this.handlers.onStatus?.('idle');
    }
}

function parseSourceReady(raw: unknown): SourceReadyPayload | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const code = typeof o['code'] === 'string' && o['code'] ? o['code'] : undefined;
    const dns = typeof o['dns'] === 'string' && o['dns'] ? o['dns'] : undefined;
    const credsRaw = o['credentials'] as Record<string, unknown> | null;
    const username =
        credsRaw && typeof credsRaw['username'] === 'string'
            ? credsRaw['username']
            : null;
    const password =
        credsRaw && typeof credsRaw['password'] === 'string'
            ? credsRaw['password']
            : null;
    if (!username || !password || (!code && !dns)) return null;
    return {
        code,
        dns,
        credentials: { username, password },
        displayName:
            typeof o['displayName'] === 'string' ? o['displayName'] : undefined,
    };
}

function extractReason(raw: unknown): string {
    if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        if (typeof o['reason'] === 'string') return o['reason'];
    }
    return '';
}

function extractAuthErrorCode(raw: unknown): string {
    if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        if (typeof o['code'] === 'string') return o['code'];
    }
    return 'UNKNOWN';
}
