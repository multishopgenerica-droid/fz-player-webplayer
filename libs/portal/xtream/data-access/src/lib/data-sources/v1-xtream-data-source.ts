import { Injectable } from '@angular/core';
import {
    XtreamCategory,
    XtreamLiveStream,
    XtreamSerieItem,
    XtreamVodStream,
} from '@iptvnator/shared/interfaces';
import { CategoryType, StreamType, XtreamCredentials } from '../services/xtream-api.service';
import { PwaXtreamDataSource } from './pwa-xtream-data-source';
import type {
    XtreamContentItem,
    XtreamOperationOptions,
} from './xtream-data-source.interface';
import {
    fetchV1Library,
    isV1Playlist,
    type V1Category,
    type V1Item,
} from './v1-gateway';

/**
 * Data source do gateway neutro /v1 (V2). Estende o PWA: quando a playlist ativa
 * é do gateway (serverUrl == gatewayOrigin), busca catálogo em `/v1/library` e
 * mapeia para os tipos Xtream. Para playlists Xtream normais, delega ao PWA.
 *
 * Favoritos/recentes/posição de playback continuam no localStorage (herdados do
 * PWA — funcionam igual). Streams: ver V1XtreamUrlService (URLs /v1/stream).
 */
@Injectable()
export class V1XtreamDataSource extends PwaXtreamDataSource {
    override async getCategories(
        playlistId: string,
        credentials: XtreamCredentials,
        type: CategoryType,
        options?: XtreamOperationOptions
    ): Promise<XtreamCategory[]> {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.getCategories(playlistId, credentials, type, options);
        }
        const kind = type === 'vod' ? 'vod' : type; // 'live'|'vod'|'series'
        const lib = await fetchV1Library(kind);
        return lib.categories.map(mapV1Category);
    }

    override async getContent(
        playlistId: string,
        credentials: XtreamCredentials,
        type: StreamType,
        onProgress?: (count: number) => void,
        onTotal?: (total: number) => void,
        options?: XtreamOperationOptions
    ): Promise<
        | XtreamLiveStream[]
        | XtreamVodStream[]
        | XtreamSerieItem[]
        | XtreamContentItem[]
    > {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.getContent(
                playlistId,
                credentials,
                type,
                onProgress,
                onTotal,
                options
            );
        }
        const kind = type === 'movie' ? 'vod' : type; // 'live'|'vod'|'series'
        const lib = await fetchV1Library(kind);
        const items = lib.items.filter((i) => i.kind === kind);
        onTotal?.(items.length);
        onProgress?.(items.length);

        // Normaliza pelos mesmos mappers do PWA (poster_url, id, xtream_id, type)
        // pra que os cards/grid recebam exatamente o shape esperado.
        const mapped =
            kind === 'live'
                ? items.map(mapV1Live)
                : kind === 'vod'
                  ? items.map(mapV1Vod)
                  : items.map(mapV1Series);
        const normalized = this.normalizeContentItems(mapped, type);
        // Popula o cache de sessão (mesma chave do PWA) pra que favoritos e
        // "continuar assistindo" consigam resolver o item ao salvar o snapshot.
        this.contentCache.set(`${playlistId}-${type}-content`, normalized);
        return normalized;
    }

    override async hasContent(): Promise<boolean> {
        // V1 sempre busca fresco do gateway (memo curto no v1-gateway).
        return false;
    }

    override async hasCategories(): Promise<boolean> {
        return false;
    }
}

// ── Mappers V1 → tipos Xtream do IPTVnator ──────────────────────────────────
function mapV1Category(c: V1Category): XtreamCategory {
    return {
        category_id: String(c.id),
        category_name: c.name,
        parent_id: 0,
    };
}

function mapV1Live(i: V1Item): XtreamLiveStream {
    return {
        num: i.id,
        name: i.title,
        stream_type: 'live',
        stream_id: i.id,
        stream_icon: i.image ?? '',
        added: '',
        category_id: String(i.categoryId),
        custom_sid: '',
        direct_source: '',
        tv_archive: 0,
        tv_archive_duration: 0,
    };
}

function mapV1Vod(i: V1Item): XtreamVodStream {
    return {
        num: i.id,
        name: i.title,
        stream_type: 'movie',
        stream_id: i.id,
        stream_icon: i.image ?? '',
        added: '',
        category_id: String(i.categoryId),
        custom_sid: '',
        direct_source: '',
        rating: 0,
        rating_5based: 0,
        container_extension: 'mp4',
    };
}

function mapV1Series(i: V1Item): XtreamSerieItem {
    return {
        num: i.id,
        name: i.title,
        series_id: i.id,
        cover: i.image ?? '',
        plot: '',
        cast: '',
        director: '',
        genre: '',
        releaseDate: i.year ?? '',
        last_modified: '',
        rating: i.rating ?? '',
        rating_5based: 0,
        backdrop_path: [],
        youtube_trailer: '',
        episode_run_time: '',
        category_id: Number(i.categoryId),
    };
}
