
import { query, execute, insert } from './src/config/db.js';
import { fetchTidalPlaylistTracks } from './src/routes/tidal.js';
import dotenv from 'dotenv';

dotenv.config();

// --- Auth Helpers ---
async function getTidalClientToken() {
    const TIDAL_AUTH_URL = 'https://auth.tidal.com/v1/oauth2/token';
    const clientId = process.env.TIDAL_CLIENT_ID;
    const clientSecret = process.env.TIDAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Tidal API credentials not configured');
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(TIDAL_AUTH_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
        throw new Error(`Tidal auth failed: ${await response.text()}`);
    }

    const data = await response.json();
    return data.access_token;
}

// --- YouTube Logic (Copied due to no export) ---
async function fetchYoutubePlaylistTracks(playlistId) {
    const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';
    const apiKey = process.env.YOUTUBE_KEY;

    if (!apiKey) return [];

    try {
        let allItems = [];
        let nextPageToken = '';
        const maxResults = 50;

        do {
            const itemsUrl = new URL(`${YOUTUBE_API_URL}/playlistItems`);
            itemsUrl.searchParams.append('key', apiKey);
            itemsUrl.searchParams.append('part', 'snippet,contentDetails');
            itemsUrl.searchParams.append('playlistId', playlistId);
            itemsUrl.searchParams.append('maxResults', maxResults.toString());
            if (nextPageToken) {
                itemsUrl.searchParams.append('pageToken', nextPageToken);
            }

            const itemsRes = await fetch(itemsUrl.toString());
            if (!itemsRes.ok) break;

            const itemsData = await itemsRes.json();
            const items = itemsData.items || [];
            if (items.length === 0) break;

            const videoIds = items
                .map(item => item.contentDetails?.videoId)
                .filter(Boolean)
                .join(',');

            let videoDetails = {};
            if (videoIds) {
                const videosUrl = new URL(`${YOUTUBE_API_URL}/videos`);
                videosUrl.searchParams.append('key', apiKey);
                videosUrl.searchParams.append('part', 'contentDetails,snippet');
                videosUrl.searchParams.append('id', videoIds);

                const videosRes = await fetch(videosUrl.toString());
                if (videosRes.ok) {
                    const videosData = await videosRes.json();
                    videoDetails = videosData.items.reduce((acc, video) => {
                        const match = video.contentDetails?.duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                        const duration = match
                            ? (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + (parseInt(match[3] || 0))
                            : 0;
                        acc[video.id] = { duration, channelTitle: video.snippet?.channelTitle };
                        return acc;
                    }, {});
                }
            }

            const processedItems = items.map((item, i) => {
                const videoId = item.contentDetails?.videoId;
                const details = videoDetails[videoId] || {};
                return {
                    id: videoId,
                    title: item.snippet.title,
                    artist: details.channelTitle || item.snippet.videoOwnerChannelTitle || 'Unknown',
                    duration: details.duration || 0,
                    position: allItems.length + i,
                    thumbnail: item.snippet.thumbnails?.high?.url || ''
                };
            });

            allItems = allItems.concat(processedItems);
            nextPageToken = itemsData.nextPageToken;
            console.log(`[YouTube] Fetched page, total: ${allItems.length}`);

        } while (nextPageToken);

        return allItems;
    } catch (error) {
        console.error('Error fetching YouTube tracks:', error);
        return [];
    }
}

// --- Main Sync Logic ---
async function resyncAllPlaylists() {
    try {
        console.log('--- Starting Global Playlist Re-sync ---');

        // Get generic token
        let tidalToken = '';
        try {
            tidalToken = await getTidalClientToken();
            console.log('✅ Acquired Tidal Token');
        } catch (e) {
            console.warn('⚠️ Could not get Tidal token:', e.message);
        }

        const playlists = await query(`
            SELECT playlist_id, title, external_id, description 
            FROM playlists 
            WHERE source_type = 'Platform' AND external_id IS NOT NULL
        `);

        console.log(`Found ${playlists.length} playlists to check.`);

        for (const p of playlists) {
            console.log(`\nProcessing: "${p.title}" (ID: ${p.playlist_id})`);

            let tracks = [];
            let source = 'Unknown';

            // Heuristics
            const isTidal = /^[0-9a-fA-F-]{36}$/.test(p.external_id) || (p.description && p.description.includes('Tidal'));
            // YouTube IDs are typically 11 chars (video) or 34 chars (playlist PL...)
            // But here we are importing playlists, so external_id should be a playlist ID (e.g. PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG)
            const isYouTube = p.external_id.startsWith('PL') || (p.description && p.description.includes('YouTube'));

            if (isTidal && tidalToken) {
                source = 'Tidal';
                console.log(`-> Identified as Tidal (UUID: ${p.external_id})`);
                tracks = await fetchTidalPlaylistTracks(tidalToken, p.external_id);
            } else if (isYouTube) {
                source = 'YouTube';
                console.log(`-> Identified as YouTube (ID: ${p.external_id})`);
                tracks = await fetchYoutubePlaylistTracks(p.external_id);
            } else {
                console.log('-> Skipping: Could not identify platform or missing token.');
                continue;
            }

            if (tracks.length === 0) {
                console.log('-> No tracks found with current ID. Attempting fallback search...');
                if (source === 'Tidal' && tidalToken) {
                    try {
                        const searchUrl = new URL('https://api.tidal.com/v1/search');
                        searchUrl.searchParams.append('query', p.title);
                        searchUrl.searchParams.append('type', 'PLAYLISTS');
                        searchUrl.searchParams.append('limit', '1');
                        searchUrl.searchParams.append('countryCode', 'US');

                        const searchRes = await fetch(searchUrl.toString(), {
                            headers: { 'Authorization': `Bearer ${tidalToken}`, 'Accept': 'application/vnd.tidal.v1+json' }
                        });

                        if (searchRes.ok) {
                            const searchData = await searchRes.json();
                            const candidate = searchData.playlists?.items?.[0];

                            if (candidate) {
                                console.log(`-> Found candidate: "${candidate.title}" (UUID: ${candidate.uuid})`);
                                console.log('-> Attempting to fetch tracks with new ID...');
                                const newTracks = await fetchTidalPlaylistTracks(tidalToken, candidate.uuid, 'US');

                                if (newTracks.length > 0) {
                                    console.log(`-> Success! Fetched ${newTracks.length} tracks from new source.`);
                                    tracks = newTracks;

                                    // Optional: Update the external_id in the database to fix it permanently?
                                    // The user said "Try again", implying they want it fixed.
                                    console.log('-> Repairing playlist external_id in database...');
                                    await execute('UPDATE playlists SET external_id = ? WHERE playlist_id = ?', [candidate.uuid, p.playlist_id]);
                                }
                            } else {
                                console.log('-> No playlist found with this title.');
                            }
                        }
                    } catch (e) {
                        console.warn('-> Fallback search failed:', e.message);
                    }
                }
            }

            if (tracks.length === 0) {
                console.log('-> Still no tracks found. Skipping update.');
                continue;
            }

            console.log(`-> Fetched ${tracks.length} tracks. Updating database...`);

            // Clear old mapping
            await execute('DELETE FROM playlist_tracks WHERE playlist_id = ?', [p.playlist_id]);

            // Insert new tracks
            let addedCount = 0;
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                try {
                    // Check logic based on platform structure
                    let metadata = {};
                    let title = track.title;
                    let artist = track.artist || 'Unknown';
                    let duration = track.duration || 0;

                    if (source === 'Tidal') {
                        // Tidal item structure: { item: { title, artist: { name }, duration, id } } or direct?
                        // fetchTidalPlaylistTracks returns items from /items endpoint.
                        // Tidal /items returns objects like { item: { ... }, type: 'track' } ?
                        // Wait, my updated fetchTidalPlaylistTracks returns `data.items`.
                        // The structure of an item in `data.items` usually has `item` property wrapping the track.
                        // Let's inspect typical Tidal response structure involved.
                        // If I look at the old code (which I removed), it didn't do deep mapping, just returned items.
                        // The usage in `import` logic would clarify.
                        // Wait, `fetchTidalPlaylistTracks` wasn't used in import logic explicitly in the files I saw?
                        // `router.post('/seed')` used a different logic (inserting directly).

                        // Let's assume standard Tidal logic:
                        // Item = { item: { id, title, artist: { name }, duration, ... } }
                        // I need to be careful here. 

                        // Let's do a safe check
                        const actualTrack = track.item || track;
                        title = actualTrack.title;
                        artist = actualTrack.artist?.name || actualTrack.artists?.[0]?.name || 'Unknown';
                        duration = actualTrack.duration || 0;
                        metadata = { tidalId: actualTrack.id, isrc: actualTrack.isrc };
                    } else {
                        // YouTube (my own function returns formatted objects)
                        // { id, title, artist, duration, position, ... }
                        metadata = { youtubeId: track.id, thumbnail: track.thumbnail };
                    }

                    const trackId = await insert(`
                        INSERT INTO tracks (title, artist, album, duration, external_metadata)
                        VALUES (?, ?, ?, ?, ?)
                    `, [
                        title,
                        artist,
                        source + ' Music',
                        duration,
                        JSON.stringify(metadata)
                    ]);

                    await insert(`
                        INSERT INTO playlist_tracks (playlist_id, track_id, order_index)
                        VALUES (?, ?, ?)
                    `, [p.playlist_id, trackId, i]);

                    addedCount++;

                    // Background Enrichment
                    import('./src/services/metadataService.js').then(m => {
                        m.default.enrichTrack(trackId, title, artist, metadata.isrc || null)
                            .catch(e => console.error(`Enrichment failed for ${trackId}:`, e.message));
                    });
                } catch (e) {
                    // console.error(e.message);
                }
            }
            console.log(`-> Successfully updated ${addedCount} tracks.`);
        }

    } catch (error) {
        console.error('Fatal error:', error);
    }
    process.exit();
}

resyncAllPlaylists();
