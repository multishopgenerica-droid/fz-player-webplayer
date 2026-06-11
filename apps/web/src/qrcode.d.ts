// Declaração ambiente mínima do `qrcode` (usada pela tela de pareamento FZ).
// Arquivo PURO ambiente (sem import/export no topo) → visível globalmente em
// todo o programa do app, incluindo libs importadas. Evita @types/qrcode, que
// puxa @types/node e reescreve o tipo global de setTimeout (number→Timeout).
declare module 'qrcode' {
    interface QRCodeRenderOptions {
        width?: number;
        margin?: number;
        color?: { dark?: string; light?: string };
        errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    }
    function toCanvas(
        canvas: HTMLCanvasElement,
        text: string,
        options?: QRCodeRenderOptions
    ): Promise<HTMLCanvasElement>;
    const QRCode: { toCanvas: typeof toCanvas };
    export default QRCode;
}
