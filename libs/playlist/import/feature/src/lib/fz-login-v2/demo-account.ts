/**
 * Conta demo pra review de loja (00000 / demo / demo). Porte mínimo de
 * PROJETO-TVS-APP/LG/app/src/services/demoAccount.ts. Bypass total de rede:
 * baseUrl não-roteável → catálogo vazio (prova que é media player neutro).
 */

export const DEMO_USER = 'demo';
export const DEMO_PASS = 'demo';
export const DEMO_CODE = '00000';
export const DEMO_BASE_URL = 'http://demo.fzplayer.invalid';

export function isAnyBypass(
    user: string,
    pass: string,
    code: string | undefined
): boolean {
    return (
        user.trim() === DEMO_USER &&
        pass === DEMO_PASS &&
        (code || '').trim() === DEMO_CODE
    );
}
