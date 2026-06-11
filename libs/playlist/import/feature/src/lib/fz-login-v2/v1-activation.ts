/**
 * Ativação no gateway neutro /v1. Porte de
 * PROJETO-TVS-APP/LG/app/src/services/v1Activation.ts.
 *
 * activateV1(code, user, pass) e activateV1Creds(dns, user, pass) trocam
 * credenciais por um TOKEN opaco (o app nunca vê o endereço/credenciais da fonte).
 */

import { getGatewayOrigin } from './app-config';
import { getV1Token, setV1Token } from './v1-config';
import { ActivationError, type ActivationErrorCode } from './activation-error';
import {
    getCanonicalFingerprint,
    getDeviceUuid,
    getUserAgent,
    getPlatformVersion,
} from './device-fingerprint';

export interface V1Profile {
    displayName?: string;
    status?: string;
    expDate?: number;
    isTrial?: boolean;
}

export interface V1Session {
    token: string;
    expiresAt?: number;
    profile?: V1Profile;
}

function v1Url(path: string): string {
    return getGatewayOrigin() + '/v1' + path;
}

export async function activateV1(
    rawCode: string,
    username: string,
    password: string,
    appVersion: string
): Promise<V1Session> {
    const code = rawCode.trim();
    if (!/^\d{5,7}$/.test(code)) {
        throw new ActivationError('INVALID', 'O código deve ter 5 a 7 dígitos.', 400);
    }
    return postActivate('/activate', {
        code,
        username,
        password,
        ...deviceFields(appVersion),
    });
}

export async function activateV1Creds(
    dns: string,
    username: string,
    password: string,
    appVersion: string
): Promise<V1Session> {
    const cleanDns = dns.trim();
    if (!cleanDns) {
        throw new ActivationError('INVALID', 'Fonte inválida.', 400);
    }
    return postActivate('/activate-creds', {
        dns: cleanDns,
        username,
        password,
        ...deviceFields(appVersion),
    });
}

function deviceFields(appVersion: string) {
    return {
        deviceFingerprint: getCanonicalFingerprint(),
        deviceUuid: getDeviceUuid(),
        userAgent: getUserAgent(appVersion),
        platformVersion: getPlatformVersion(),
        language:
            typeof navigator !== 'undefined'
                ? navigator.language || 'pt-BR'
                : 'pt-BR',
    };
}

async function postActivate(
    path: string,
    payload: Record<string, unknown>
): Promise<V1Session> {
    let res: Response;
    try {
        res = await fetch(v1Url(path), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(payload),
        });
    } catch {
        throw new ActivationError('NETWORK', 'Não foi possível conectar.', 0);
    }

    const body = (await res.json().catch(() => null)) as Record<
        string,
        unknown
    > | null;

    if (res.ok && body && typeof body['token'] === 'string' && body['token']) {
        const profile =
            body['profile'] && typeof body['profile'] === 'object'
                ? (body['profile'] as Record<string, unknown>)
                : null;
        const session: V1Session = {
            token: body['token'] as string,
            expiresAt:
                typeof body['expiresAt'] === 'number'
                    ? (body['expiresAt'] as number)
                    : undefined,
            profile: profile
                ? {
                      displayName:
                          typeof profile['displayName'] === 'string'
                              ? (profile['displayName'] as string)
                              : undefined,
                      status:
                          typeof profile['status'] === 'string'
                              ? (profile['status'] as string)
                              : undefined,
                      expDate:
                          typeof profile['expDate'] === 'number'
                              ? (profile['expDate'] as number)
                              : undefined,
                      isTrial:
                          profile['isTrial'] === true ||
                          profile['isTrial'] === 1 ||
                          profile['isTrial'] === '1',
                  }
                : undefined,
        };
        setV1Token(session.token);
        return session;
    }

    if (body && typeof body === 'object') {
        const errCode =
            typeof body['code'] === 'string' ? (body['code'] as string) : null;
        const message =
            typeof body['message'] === 'string'
                ? (body['message'] as string)
                : 'Erro desconhecido';
        if (errCode && isKnownV1ErrorCode(errCode)) {
            throw new ActivationError(
                errCode as ActivationErrorCode,
                message,
                res.status
            );
        }
    }

    throw new ActivationError(
        'UNKNOWN',
        'Resposta inesperada. Tente novamente.',
        res.status
    );
}

export async function getV1Status(): Promise<{
    active: boolean;
    expiresAt?: number;
} | null> {
    const token = getV1Token();
    if (!token) return null;
    try {
        const res = await fetch(v1Url('/status'), {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const b = (await res.json().catch(() => null)) as Record<
            string,
            unknown
        > | null;
        if (!b) return null;
        return {
            active: b['active'] === true,
            expiresAt:
                typeof b['expiresAt'] === 'number'
                    ? (b['expiresAt'] as number)
                    : undefined,
        };
    } catch {
        return null;
    }
}

export function clearV1Session(): void {
    setV1Token(null);
}

function isKnownV1ErrorCode(s: string): boolean {
    return [
        'INVALID_CODE',
        'CODE_INACTIVE',
        'LICENSE_NOT_FOUND',
        'LICENSE_PENDING',
        'LICENSE_SUSPENDED',
        'LICENSE_EXPIRED',
        'DEVICE_LIMIT_REACHED',
        'AUTH_REVOKED',
        'VALIDATION',
        'NOT_FOUND',
        'EXPIRED',
        'NETWORK',
        'INVALID',
        'UNKNOWN',
    ].includes(s);
}
