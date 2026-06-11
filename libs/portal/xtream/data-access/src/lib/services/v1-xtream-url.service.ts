import { Injectable } from '@angular/core';
import {
    XtreamSerieEpisode,
    XtreamVodDetails,
} from '@iptvnator/shared/interfaces';
import { XtreamUrlService } from './xtream-url.service';
import { XtreamCredentials } from './xtream-api.service';
import { buildV1StreamUrl, isV1Playlist } from '../data-sources/v1-gateway';

/**
 * URL service que produz links `/v1/stream/{kind}/{id}?t={token}` quando a
 * playlist é do gateway V2; senão delega ao XtreamUrlService normal.
 */
@Injectable({ providedIn: 'root' })
export class V1XtreamUrlService extends XtreamUrlService {
    override constructLiveUrl(
        credentials: XtreamCredentials,
        xtreamId: number,
        format?: string
    ): string {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.constructLiveUrl(credentials, xtreamId, format);
        }
        // `.ts` (MPEG-TS): o provedor serve o live em TS com CORS aberto, então o
        // mpegts.js toca via 302 direto. `.m3u8` 404 em muitos provedores Xtream.
        return buildV1StreamUrl('live', `${xtreamId}.ts`);
    }

    override constructVodUrl(
        credentials: XtreamCredentials,
        vodItem: XtreamVodDetails
    ): string {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.constructVodUrl(credentials, vodItem);
        }
        const vod = vodItem as XtreamVodDetails & { stream_id?: number };
        const streamId = vod.movie_data?.stream_id ?? vod.stream_id;
        if (!streamId) return '';
        // Sufixo `.mp4`: VOD é arquivo progressivo. Sem extensão, o ArtPlayer
        // assume MPEG-TS (mpegts.js via fetch → bloqueado por CORS no provedor).
        // Com `.mp4` ele usa <video> nativo, que segue o 302 sem exigir CORS.
        return buildV1StreamUrl('vod', `${streamId}.mp4`);
    }

    override constructEpisodeUrl(
        credentials: XtreamCredentials,
        episode: XtreamSerieEpisode
    ): string {
        if (!isV1Playlist(credentials.serverUrl)) {
            return super.constructEpisodeUrl(credentials, episode);
        }
        // Episódio também é arquivo progressivo → `.mp4` p/ <video> nativo.
        return buildV1StreamUrl('episode', `${episode.id}.mp4`);
    }
}
