/**
 * Config + auth da camada de dados /v1 (gateway neutro). Porte de
 * PROJETO-TVS-APP/LG/app/src/services/v1Config.ts.
 *
 * Token (Bearer) populado pelo /v1/activate; mantido em memória + localStorage
 * pra persistir entre reinícios. Opaco, expira (expiresAt); limpo só no logout.
 */

import { getGatewayOrigin } from './app-config';

/** Base da REST neutra: {gatewayOrigin}/v1 */
export function v1Base(): string {
    return getGatewayOrigin() + '/v1';
}

let _token: string | null = null;
const TOKEN_KEY = 'fz:v1:token';

export function getV1Token(): string | null {
    if (_token) return _token;
    try {
        _token = localStorage.getItem(TOKEN_KEY);
    } catch {
        /* ignore */
    }
    return _token;
}

export function setV1Token(t: string | null): void {
    _token = t;
    try {
        if (t) localStorage.setItem(TOKEN_KEY, t);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* ignore */
    }
}
