import { Injectable, signal } from '@angular/core';

/**
 * Controle parental — porte do FZ Player LG (useParental + mediaAdapters).
 *
 * - PIN de 4 dígitos em localStorage ('fz:pin'). 1º acesso a conteúdo adulto
 *   sem PIN → fluxo de CRIAÇÃO; depois → VERIFICAÇÃO.
 * - Detecção de adulto por regex no nome da categoria (xxx, adulto, 18+, porn,
 *   erotic). O catálogo Xtream traz "[XXX] Adultos" etc.
 * - `unlocked` é TRANSIENTE (nunca persiste): trava a cada reload/saída. Quem
 *   quer entrar no fluxo adulto destrava com PIN; ao recarregar, re-trava.
 */
@Injectable({ providedIn: 'root' })
export class ParentalService {
    private static readonly PIN_KEY = 'fz:pin';

    /** Categoria/título adulto: xxx, adult[oa], 18+, porn, ero[tc]ic. */
    static readonly ADULT_REGEX = /xxx|adult[oa]?|18\+|porn|ero[tc]ic/i;

    /** Desbloqueado AGORA (sessão). Default false → sempre começa travado. */
    readonly unlocked = signal(false);

    isAdultCategory(name: string | null | undefined): boolean {
        return !!name && ParentalService.ADULT_REGEX.test(name);
    }

    /**
     * IDs das categorias adultas de uma lista (XtreamCategory ou similar).
     * Usado pra esconder itens adultos de "All Items"/busca/dashboard — eles só
     * aparecem ao entrar na categoria adulta específica (que passa pelo PIN).
     */
    adultCategoryIds(
        cats: ReadonlyArray<{
            category_id?: string | number;
            id?: string | number;
            category_name?: string;
            name?: string;
        }>
    ): Set<number> {
        const ids = new Set<number>();
        for (const c of cats) {
            if (this.isAdultCategory(c.category_name ?? c.name)) {
                const id = Number(c.category_id ?? c.id);
                if (Number.isFinite(id)) ids.add(id);
            }
        }
        return ids;
    }

    /** A categoria está travada (adulta E ainda não desbloqueada nesta sessão)? */
    isCategoryLocked(name: string | null | undefined): boolean {
        return this.isAdultCategory(name) && !this.unlocked();
    }

    isPinSet(): boolean {
        try {
            const saved = localStorage.getItem(ParentalService.PIN_KEY);
            return !!saved && /^\d{4}$/.test(saved);
        } catch {
            return false;
        }
    }

    verifyPin(pin: string): boolean {
        try {
            const saved = localStorage.getItem(ParentalService.PIN_KEY);
            return !!saved && /^\d{4}$/.test(saved) && pin === saved;
        } catch {
            return false;
        }
    }

    setPin(pin: string): void {
        try {
            if (/^\d{4}$/.test(pin)) {
                localStorage.setItem(ParentalService.PIN_KEY, pin);
            }
        } catch {
            /* localStorage indisponível */
        }
    }

    unlock(): void {
        this.unlocked.set(true);
    }

    lock(): void {
        this.unlocked.set(false);
    }
}
