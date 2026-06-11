import { Injectable } from '@angular/core';
import {
    EpgItem,
    XtreamSerieDetails,
    XtreamSerieEpisode,
    XtreamSerieInfo,
    XtreamVodDetails,
    XtreamVodInfo,
} from '@iptvnator/shared/interfaces';
import {
    XtreamApiService,
    XtreamCredentials,
    XtreamRequestOptions,
} from './xtream-api.service';
import { XtreamAccountInfo } from '../account-info/account-info.interface';
import {
    fetchV1Epg,
    fetchV1Item,
    isV1Playlist,
    type V1Episode,
    type V1ItemDetail,
    type V1Program,
    type V1SeriesDetail,
} from '../data-sources/v1-gateway';

/**
 * API service que roteia detalhe de VOD/série + EPG pro gateway neutro `/v1`
 * quando a playlist é do gateway V2; senão delega ao XtreamApiService normal.
 *
 * Espelha o `V1XtreamUrlService` (que faz o mesmo pras URLs de stream). Mapeia
 * `/v1/item/{kind}/{id}` e `/v1/epg/{id}` pros MESMOS tipos que o IPTVnator já
 * consome (XtreamVodDetails / XtreamSerieDetails / EpgItem), então telas de
 * detalhe e o painel de EPG funcionam sem tocar uma linha.
 *
 * Referência validada (LG webOS): FZ-Player-LG/LG/app/src/services/libraryApi.ts
 * Contrato: GATEWAY-NEUTRO-V1 §2.3 (item) e §2.6 (epg).
 */
@Injectable({ providedIn: 'root' })
export class V1XtreamApiService extends XtreamApiService {
    /**
     * Status da conta. O gateway neutro V2 NÃO fala `player_api.php` — a conta já
     * foi validada no `/v1/activate` (token opaco). Sintetiza `status: 'Active'`
     * pra `resolvePortalStatus` liberar o load de catálogo; senão delega ao Xtream.
     */
    override async getAccountInfo(
        credentials: XtreamCredentials,
        options?: XtreamRequestOptions
    ): Promise<XtreamAccountInfo> {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.getAccountInfo(credentials, options);
        }
        return {
            user_info: {
                auth: 1,
                status: 'Active',
                username: credentials.username,
            },
            server_info: {},
        } as unknown as XtreamAccountInfo;
    }

    override async getVodInfo(
        credentials: XtreamCredentials,
        vodId: string | number,
        options?: XtreamRequestOptions
    ): Promise<XtreamVodDetails> {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.getVodInfo(credentials, vodId, options);
        }
        return mapVodDetail(await fetchV1Item('vod', vodId), vodId);
    }

    override async getSeriesInfo(
        credentials: XtreamCredentials,
        seriesId: string | number,
        options?: XtreamRequestOptions
    ): Promise<XtreamSerieDetails> {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.getSeriesInfo(credentials, seriesId, options);
        }
        return mapSeriesDetail(await fetchV1Item('series', seriesId));
    }

    override async getShortEpg(
        credentials: XtreamCredentials,
        streamId: number,
        limit = 10,
        options?: XtreamRequestOptions
    ): Promise<EpgItem[]> {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.getShortEpg(credentials, streamId, limit, options);
        }
        const epg = await fetchV1Epg(streamId);
        const out: EpgItem[] = [];
        if (epg.now) out.push(mapProgram(epg.now, streamId));
        for (const p of epg.next ?? []) out.push(mapProgram(p, streamId));
        return out.slice(0, limit);
    }

    override async getFullEpg(
        credentials: XtreamCredentials,
        streamId: number,
        options?: XtreamRequestOptions
    ): Promise<EpgItem[]> {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.getFullEpg(credentials, streamId, options);
        }
        // O gateway só expõe now/next por canal (§2.6); reusa o short EPG.
        return this.getShortEpg(credentials, streamId, 24, options);
    }
}

// ── Mappers /v1 → tipos do IPTVnator ────────────────────────────────────────
function mapVodDetail(
    d: V1ItemDetail,
    vodId: string | number
): XtreamVodDetails {
    const image = d.image ?? '';
    return {
        info: {
            name: d.title,
            plot: d.overview ?? '',
            description: d.overview ?? '',
            movie_image: image,
            cover_big: image,
            backdrop_path: image ? [image] : [],
            duration_secs: d.runtimeSecs ?? 0,
            releasedate: d.year ? String(d.year) : '',
            rating: d.rating ?? '',
            genre: d.genres ?? '',
            cast: d.cast ?? '',
            actors: d.cast ?? '',
            director: d.director ?? '',
        } as XtreamVodInfo,
        movie_data: {
            stream_id: Number(d.id ?? vodId),
            name: d.title,
            added: '',
            category_id: '',
            container_extension: 'mp4',
            custom_sid: null,
            direct_source: '',
        },
    };
}

function mapSeriesDetail(d: V1SeriesDetail): XtreamSerieDetails {
    const cover = d.image ?? '';
    const episodes: Record<string, XtreamSerieEpisode[]> = {};
    for (const s of d.seasons ?? []) {
        episodes[String(s.number)] = (s.episodes ?? []).map((e) =>
            mapEpisode(e, s.number)
        );
    }
    return {
        seasons: [],
        info: {
            name: d.title,
            cover,
            plot: d.overview ?? '',
            cast: d.cast ?? '',
            director: d.director ?? '',
            genre: d.genres ?? '',
            releaseDate: d.year ? String(d.year) : '',
            rating: d.rating ?? '',
            backdrop_path: cover ? [cover] : [],
        } as XtreamSerieInfo,
        episodes,
    };
}

function mapEpisode(e: V1Episode, season: number): XtreamSerieEpisode {
    return {
        id: String(e.id),
        episode_num: Number(e.number),
        title: e.title,
        container_extension: 'mp4',
        season,
        added: '',
        custom_sid: '',
        direct_source: '',
        info: {
            plot: e.overview ?? '',
            duration_secs: e.runtimeSecs ?? 0,
            movie_image: e.image ?? '',
        },
    };
}

/** unix seconds → "YYYY-MM-DD HH:MM:SS" (formato nativo Xtream que a UI espera). */
function fmtXtreamTime(unixSecs: number): string {
    const d = new Date(unixSecs * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
        d.getHours()
    )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function mapProgram(p: V1Program, streamId: number | string): EpgItem {
    const start = fmtXtreamTime(p.start);
    const end = fmtXtreamTime(p.end);
    return {
        id: `${streamId}-${p.start}`,
        epg_id: String(streamId),
        title: p.title,
        lang: '',
        start,
        end,
        stop: end,
        description: p.description ?? '',
        channel_id: String(streamId),
        start_timestamp: String(p.start),
        stop_timestamp: String(p.end),
    };
}
