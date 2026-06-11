/**
 * Erro de ativação (V2). Porte de PROJETO-TVS-APP/LG/app/src/services/activation.ts
 * (só a classe + codes; o resto do arquivo era Xtream-direto legado).
 */

export type ActivationErrorCode =
    | 'INVALID'
    | 'INVALID_CODE'
    | 'CODE_INACTIVE'
    | 'NOT_FOUND'
    | 'LICENSE_NOT_FOUND'
    | 'LICENSE_PENDING'
    | 'LICENSE_SUSPENDED'
    | 'LICENSE_EXPIRED'
    | 'DEVICE_LIMIT_REACHED'
    | 'AUTH_REVOKED'
    | 'VALIDATION'
    | 'EXPIRED'
    | 'NETWORK'
    | 'UNKNOWN';

export class ActivationError extends Error {
    constructor(
        public readonly code: ActivationErrorCode,
        message: string,
        public readonly httpStatus = 0,
        public readonly extra?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ActivationError';
    }
}

/** Mensagens PT-BR (espelham login.errors do i18n LG). */
export function activationErrorMessage(code: string): string {
    const map: Record<string, string> = {
        INVALID: 'O código deve ter 5 dígitos.',
        INVALID_CODE: 'Código inválido. Verifique os dígitos.',
        CODE_INACTIVE: 'Código desativado. Entre em contato com o suporte.',
        NOT_FOUND: 'Código não encontrado. Verifique o código informado.',
        LICENSE_NOT_FOUND: 'Licença não encontrada. Entre em contato com o suporte.',
        LICENSE_PENDING: 'Licença pendente de pagamento. Entre em contato com o suporte.',
        LICENSE_SUSPENDED: 'Licença suspensa. Entre em contato com o suporte.',
        LICENSE_EXPIRED: 'Licença expirou. Entre em contato com o suporte.',
        DEVICE_LIMIT_REACHED: 'Limite de dispositivos atingido. Remova outro dispositivo.',
        AUTH_REVOKED: 'Este dispositivo foi revogado.',
        VALIDATION: 'Dados inválidos. Confira e tente de novo.',
        EXPIRED: 'Código expirado. Solicite um novo código.',
        NETWORK: 'Falha de conexão. Tente novamente.',
        UNKNOWN: 'Algo deu errado. Tente de novo.',
    };
    return map[code] ?? map['UNKNOWN'];
}
