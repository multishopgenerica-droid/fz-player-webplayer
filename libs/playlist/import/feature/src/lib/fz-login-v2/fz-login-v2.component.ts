import {
    AfterViewInit,
    Component,
    ElementRef,
    OnDestroy,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import QRCode from 'qrcode';
import { PlaylistActions } from '@iptvnator/m3u-state';
import { Playlist } from '@iptvnator/shared/interfaces';
import { v4 as uuid } from 'uuid';
import {
    getCanonicalFingerprint,
    getDeviceFingerprintDisplay,
} from './device-fingerprint';
import {
    getActivateOrigin,
    getConnectUrl,
    getGatewayOrigin,
    loadAppConfig,
} from './app-config';
import { activateV1, activateV1Creds, type V1Session } from './v1-activation';
import { ActivationError, activationErrorMessage } from './activation-error';
import { PairingSession } from './pairing';
import { isAnyBypass, DEMO_BASE_URL } from './demo-account';

const APP_VERSION = '1.0.0';

// Senha-sentinel não-vazia: o V1 autentica por token (não por senha), mas o
// IPTVnator rejeita playlists com senha vazia. Valor cosmético, nunca vai ao fio.
const V1_SENTINEL_PASSWORD = 'v1';

/**
 * Login V2 — réplica da LoginScreen do FZ Player LG webOS (spec V2 §4).
 * AGORA COM LÓGICA: form → activateV1 (/v1/activate) + QR → PairingSession
 * (Socket.IO pre-auth → source-ready → activateV1/creds). Ao ativar, dispara
 * addPlaylist apontando pro gateway /v1 (consumido pelo V1 data source — Fase B).
 */
@Component({
    selector: 'app-fz-login-v2',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './fz-login-v2.component.html',
    styleUrl: './fz-login-v2.component.scss',
})
export class FzLoginV2Component implements AfterViewInit, OnDestroy {
    private readonly store = inject(Store);
    private readonly qrCanvas =
        viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');

    readonly code = signal('');
    readonly user = signal('');
    readonly pass = signal('');
    readonly showPassword = signal(false);
    readonly submitting = signal(false);
    readonly errorMsg = signal<string | null>(null);

    codeFocused = false;
    userFocused = false;
    passFocused = false;

    readonly activateHost = getActivateOrigin().replace(/^https?:\/\//, '');
    readonly fingerprintDisplay = getDeviceFingerprintDisplay();
    private qrUrl = `${getConnectUrl()}?fingerprint=${encodeURIComponent(
        getCanonicalFingerprint()
    )}`;

    private pairing: PairingSession | null = null;

    async ngAfterViewInit(): Promise<void> {
        // Atualiza hosts pelo config remoto (não bloqueia o QR inicial).
        loadAppConfig().then(() => {
            this.qrUrl = `${getConnectUrl()}?fingerprint=${encodeURIComponent(
                getCanonicalFingerprint()
            )}`;
            this.renderQr();
        });
        this.renderQr();
        this.startPairing();
    }

    ngOnDestroy(): void {
        this.pairing?.disconnect();
        this.pairing = null;
    }

    onCodeInput(value: string): void {
        this.code.set((value ?? '').replace(/\D/g, '').slice(0, 5));
        this.errorMsg.set(null);
    }

    togglePassword(): void {
        this.showPassword.update((v) => !v);
    }

    canSubmit(): boolean {
        return (
            this.user().length > 0 &&
            this.pass().length > 0 &&
            /^\d{5}$/.test(this.code().trim()) &&
            !this.submitting()
        );
    }

    /** Login por formulário: código + usuário + senha → /v1/activate. */
    async handleSubmit(): Promise<void> {
        if (!this.canSubmit()) return;
        const code = this.code().trim();
        const username = this.user().trim();
        const password = this.pass();
        await this.doActivate(() => activateV1(code, username, password, APP_VERSION), {
            username,
            code,
        });
    }

    private renderQr(): void {
        const canvas = this.qrCanvas()?.nativeElement;
        if (!canvas) return;
        QRCode.toCanvas(canvas, this.qrUrl, {
            width: 240,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#FFFFFF' },
        }).catch(() => {
            /* falha silenciosa */
        });
    }

    /** Socket.IO pre-auth: aguarda o celular cadastrar a fonte (source-ready). */
    private startPairing(): void {
        if (this.pairing) return;
        this.pairing = new PairingSession(
            {
                onSourceReady: (p) => {
                    void this.doActivate(
                        () =>
                            p.code
                                ? activateV1(
                                      p.code,
                                      p.credentials.username,
                                      p.credentials.password,
                                      APP_VERSION
                                  )
                                : activateV1Creds(
                                      p.dns as string,
                                      p.credentials.username,
                                      p.credentials.password,
                                      APP_VERSION
                                  ),
                        {
                            username: p.credentials.username,
                            code: p.code,
                            dns: p.dns,
                            displayName: p.displayName,
                        }
                    );
                },
                onAuthError: (c) => this.errorMsg.set(activationErrorMessage(c)),
                onRevoked: () =>
                    this.errorMsg.set(activationErrorMessage('AUTH_REVOKED')),
                onLicenseExpired: () =>
                    this.errorMsg.set(activationErrorMessage('LICENSE_EXPIRED')),
            },
            APP_VERSION
        );
        this.pairing.connect();
    }

    /** Núcleo: ativa (form ou QR), e em sucesso cria a playlist do gateway. */
    private async doActivate(
        run: () => Promise<V1Session>,
        meta: {
            username: string;
            code?: string;
            dns?: string;
            displayName?: string;
        }
    ): Promise<void> {
        this.submitting.set(true);
        this.errorMsg.set(null);
        try {
            // Demo (review de loja): sessão local vazia, sem rede.
            if (isAnyBypass(meta.username, this.pass(), meta.code)) {
                this.createPlaylist(DEMO_BASE_URL, meta.username, meta.displayName);
                return;
            }
            await run(); // token setado em v1-config por activateV1
            this.createPlaylist(
                getGatewayOrigin(),
                meta.username,
                meta.displayName
            );
        } catch (err) {
            this.errorMsg.set(this.mapError(err));
        } finally {
            this.submitting.set(false);
        }
    }

    /** Cria a playlist Xtream apontando pro gateway. O V1 data source (Fase B)
     *  usa o token (v1-config), não a senha — então a senha aqui é só um sentinel
     *  não-vazio. IMPORTANTE: o IPTVnator descarta playlists com senha vazia
     *  (toXtreamPlaylistData → null), o que impediria o bootstrap do catálogo. */
    private createPlaylist(
        serverUrl: string,
        username: string,
        displayName?: string
    ): void {
        this.store.dispatch(
            PlaylistActions.addPlaylist({
                playlist: {
                    _id: uuid(),
                    title: displayName || username,
                    username,
                    password: V1_SENTINEL_PASSWORD,
                    serverUrl,
                    importDate: new Date().toISOString(),
                } as unknown as Playlist,
            })
        );
    }

    private mapError(err: unknown): string {
        if (err instanceof ActivationError)
            return activationErrorMessage(err.code);
        if (err instanceof Error) return err.message;
        return activationErrorMessage('UNKNOWN');
    }
}
