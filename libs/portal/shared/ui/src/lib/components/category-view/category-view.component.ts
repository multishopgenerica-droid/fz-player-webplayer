import {
    ChangeDetectionStrategy,
    Component,
    effect,
    ElementRef,
    inject,
    input,
    output,
} from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { ParentalService } from '@iptvnator/services';
import { PlaylistErrorViewComponent } from '../playlist-error-view/playlist-error-view.component';
import {
    ParentalPinDialogComponent,
    ParentalPinDialogData,
} from '../parental-pin-dialog/parental-pin-dialog.component';

interface CategoryViewItem {
    readonly category_id?: string | number;
    readonly category_name?: string;
    readonly count?: number;
    readonly id?: string | number;
    readonly name?: string;
}

@Component({
    selector: 'app-category-view',
    imports: [MatListModule, MatIcon, PlaylistErrorViewComponent, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './category-view.component.html',
    styleUrls: ['./category-view.component.scss'],
})
export class CategoryViewComponent {
    readonly items = input<CategoryViewItem[]>([]);
    readonly selectedCategoryId = input<string | number | null | undefined>();
    readonly itemCounts = input<Map<number, number>>(new Map());
    readonly showCounts = input<boolean>(false);
    private readonly hostEl = inject(ElementRef<HTMLElement>);
    private readonly parental = inject(ParentalService);
    private readonly dialog = inject(MatDialog);

    readonly categoryClicked = output<CategoryViewItem>();

    /** Categoria adulta ainda travada nesta sessão (mostra cadeado). */
    isLocked(item: CategoryViewItem): boolean {
        return this.parental.isCategoryLocked(
            item.category_name ?? item.name
        );
    }

    /** Clique na categoria: se travada (adulta), pede PIN antes de abrir. */
    onCategoryClick(item: CategoryViewItem): void {
        if (!this.isLocked(item)) {
            this.categoryClicked.emit(item);
            return;
        }
        const data: ParentalPinDialogData = {
            mode: this.parental.isPinSet() ? 'enter' : 'create',
        };
        this.dialog
            .open(ParentalPinDialogComponent, {
                data,
                autoFocus: false,
                panelClass: 'parental-pin-panel',
            })
            .afterClosed()
            .subscribe((unlocked) => {
                if (unlocked) {
                    this.categoryClicked.emit(item);
                }
            });
    }

    constructor() {
        effect(() => {
            const selectedCategory = this.selectedCategoryId();
            if (selectedCategory == null) return;

            queueMicrotask(() => {
                const container = this.hostEl.nativeElement as HTMLElement;
                const candidates = Array.from(
                    container.querySelectorAll('[data-category-id]')
                ) as HTMLElement[];
                const selected = candidates.find(
                    (el) => el.dataset.categoryId === String(selectedCategory)
                );
                if (!selected) {
                    return;
                }

                const containerRect = container.getBoundingClientRect();
                const selectedRect = selected.getBoundingClientRect();
                const targetTop =
                    container.scrollTop +
                    (selectedRect.top - containerRect.top) -
                    container.clientHeight / 2 +
                    selectedRect.height / 2;
                const maxScrollTop = Math.max(
                    0,
                    container.scrollHeight - container.clientHeight
                );

                container.scrollTo({
                    behavior: 'smooth',
                    top: Math.min(maxScrollTop, Math.max(0, targetTop)),
                });
            });
        });
    }

    isSelected(item: CategoryViewItem): boolean {
        const selectedCategory = this.selectedCategoryId();
        const itemId = item.category_id ?? item.id;

        // Compare as strings to handle both numeric and string category IDs.
        return (
            selectedCategory != null &&
            String(selectedCategory) === String(itemId)
        );
    }

    getItemCount(item: CategoryViewItem): number {
        // content.category_id references categories.id (internal DB id)
        // For DB format categories, use id; for API format, use category_id
        const itemId = Number(item.id ?? item.category_id);
        return this.itemCounts().get(itemId) ?? 0;
    }
}
