import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    signal,
} from '@angular/core';
import {
    MAT_DIALOG_DATA,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { ParentalService } from '@iptvnator/services';

export interface ParentalPinDialogData {
    /** 'enter' verifica o PIN salvo; 'create' cria (novo + confirma). */
    mode: 'enter' | 'create';
}

/**
 * Modal de PIN do controle parental (porte do ParentalGate do FZ LG).
 * - mode 'create': digita novo PIN, confirma, grava e desbloqueia.
 * - mode 'enter': digita o PIN salvo; se confere, desbloqueia.
 * Fecha com `true` quando desbloqueia; senão `false`/undefined.
 */
@Component({
    selector: 'app-parental-pin-dialog',
    standalone: true,
    imports: [
        MatDialogModule,
        MatButtonModule,
        MatIcon,
        TranslatePipe,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './parental-pin-dialog.component.html',
    styleUrl: './parental-pin-dialog.component.scss',
})
export class ParentalPinDialogComponent {
    private readonly parental = inject(ParentalService);
    private readonly dialogRef =
        inject<MatDialogRef<ParentalPinDialogComponent, boolean>>(MatDialogRef);
    private readonly data = inject<ParentalPinDialogData>(MAT_DIALOG_DATA);

    // No modo 'create', a 1ª etapa coleta o novo PIN; a 2ª confirma.
    readonly isCreate = this.data.mode === 'create';
    readonly value = signal('');
    readonly firstPin = signal<string | null>(null);
    readonly error = signal<'wrong' | 'mismatch' | null>(null);

    readonly titleKey = computed(() => {
        if (!this.isCreate) return 'PARENTAL.ENTER_TITLE';
        return this.firstPin() === null
            ? 'PARENTAL.CREATE_TITLE'
            : 'PARENTAL.CONFIRM_TITLE';
    });

    readonly digits = computed(() => this.value().padEnd(4, '·').slice(0, 4).split(''));
    readonly canSubmit = computed(() => /^\d{4}$/.test(this.value()));

    press(n: number): void {
        if (this.value().length >= 4) return;
        this.error.set(null);
        this.value.update((v) => v + String(n));
        if (this.value().length === 4) this.submit();
    }

    backspace(): void {
        this.error.set(null);
        this.value.update((v) => v.slice(0, -1));
    }

    submit(): void {
        const pin = this.value();
        if (!/^\d{4}$/.test(pin)) return;

        if (!this.isCreate) {
            if (this.parental.verifyPin(pin)) {
                this.parental.unlock();
                this.dialogRef.close(true);
            } else {
                this.error.set('wrong');
                this.value.set('');
            }
            return;
        }

        // create: 1ª etapa guarda; 2ª confirma.
        if (this.firstPin() === null) {
            this.firstPin.set(pin);
            this.value.set('');
            return;
        }
        if (this.firstPin() === pin) {
            this.parental.setPin(pin);
            this.parental.unlock();
            this.dialogRef.close(true);
        } else {
            this.error.set('mismatch');
            this.firstPin.set(null);
            this.value.set('');
        }
    }

    cancel(): void {
        this.dialogRef.close(false);
    }
}
