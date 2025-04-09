/**
 * Fetches the M3U playlist content from a given URL.
 * Includes a basic attempt to use a CORS proxy if direct fetch fails.
 * @param {string} url - The URL of the M3U playlist.
 * @returns {Promise<string>} - A promise that resolves with the M3U text content.
 */
export async function fetchM3U(url) {
    try {
        console.log("Attempting direct fetch for:", url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
         console.warn("Direct fetch failed:", error);
         // Basic CORS proxy prefix - use with caution for testing ONLY
         // List of potential proxies
         const proxies = [
            'https://corsproxy.io/?', // General purpose proxy
            'https://api.allorigins.win/raw?url=', // Another general proxy
            // 'https://cors-anywhere.herokuapp.com/' // Often rate-limited or down
         ];

         // Try proxies one by one
         for (const proxy of proxies) {
             const proxyUrl = proxy + encodeURIComponent(url);
             console.log("Attempting fetch via proxy:", proxy.split('?')[0] || proxy.split('/')[2]); // Log proxy domain
             try {
                 const proxyResponse = await fetch(proxyUrl);
                 if (!proxyResponse.ok) {
                     throw new Error(`Proxy HTTP error! status: ${proxyResponse.status} using ${proxy.split('/')[2]}`);
                 }
                 console.log("Fetch successful via proxy:", proxy.split('/')[2]);
                 return await proxyResponse.text();
             } catch (proxyError) {
                 console.warn(`Proxy fetch failed (${proxy.split('/')[2]}):`, proxyError);
                 // Continue to the next proxy
             }
         }
         // If all proxies fail, re-throw the original error or a combined error
         throw new Error(`Failed to fetch playlist directly and via all proxies. Original error: ${error.message}`);
    }
}

/**
 * Parses the M3U text content into an array of channel objects.
 * @param {string} m3uText - The M3U playlist content as a string.
 * @returns {Array<object>} - An array of channel objects { url, name, group, logo, rawInf }.
 */
export function parseM3U(m3uText) {
    const channels = [];
    const lines = m3uText.split('\n');
    let currentChannel = {};
    let firstLine = true;
    let currentGroupFromExtGrp = null; // Store group from #EXTGRP

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (firstLine) {
            if (!trimmedLine.startsWith('#EXTM3U')) {
                console.warn("Playlist doesn't start with #EXTM3U. Trying to parse anyway.");
            }
            firstLine = false;
            continue; // Move to the next line after checking the header
        }

        if (trimmedLine.startsWith('#EXTINF:')) {
            // Reset for new channel info, carrying over the last #EXTGRP if needed
            currentChannel = {
                url: null,
                name: 'Unknown',
                group: currentGroupFromExtGrp || 'Uncategorized', // Default to EXTGRP or Uncategorized
                logo: null,
                rawInf: trimmedLine
            };
            currentGroupFromExtGrp = null; // Reset EXTGRP after use

            const infoLine = trimmedLine.substring(8); // Remove '#EXTINF:'
            const commaIndex = infoLine.lastIndexOf(',');

            if (commaIndex === -1) {
                 console.warn(`Skipping malformed #EXTINF line (no comma): ${trimmedLine}`);
                 currentChannel = {}; // Reset invalid entry
                 continue;
            }

            const metadata = infoLine.substring(0, commaIndex);
            currentChannel.name = infoLine.substring(commaIndex + 1).trim();
            if (!currentChannel.name) currentChannel.name = 'Unnamed Channel';


            // Extract attributes: tvg-id, tvg-logo, group-title etc. using regex
            const attributes = {};
            const regex = /(\S+?)="([^"]*)"/g;
            let match;
            while ((match = regex.exec(metadata)) !== null) {
                attributes[match[1].toLowerCase()] = match[2];
            }

            // Use group-title if present, overriding #EXTGRP
            if (attributes['group-title']) {
                currentChannel.group = attributes['group-title'];
            }
            if (attributes['tvg-logo']) {
                currentChannel.logo = attributes['tvg-logo'];
            }
            // Store other potential attributes if needed
             currentChannel.tvgId = attributes['tvg-id'];


        } else if (trimmedLine.startsWith('#EXTGRP:')) {
            // Store the group defined by #EXTGRP for the *next* channel
            // This will be overridden if the next #EXTINF has group-title
            currentGroupFromExtGrp = trimmedLine.substring(8).trim();

        } else if (trimmedLine && !trimmedLine.startsWith('#')) {
            // This should be the URL
            if (currentChannel.name && currentChannel.name !== 'Unknown') { // Check if we have a valid preceding #EXTINF
                currentChannel.url = trimmedLine;
                // Simple URL validation (very basic)
                if (currentChannel.url.startsWith('http://') || currentChannel.url.startsWith('https://')) {
                     channels.push(currentChannel);
                } else {
                    console.warn(`Skipping entry with invalid URL: ${currentChannel.name} (${trimmedLine})`)
                }
                currentChannel = {}; // Reset for the next one
                currentGroupFromExtGrp = null; // Also reset EXTGRP just in case
            } else {
                 // Stray URL without preceding #EXTINF, log warning
                 console.warn(`Skipping URL without preceding #EXTINF: ${trimmedLine}`);
            }
        }
        // Ignore other lines (#EXTVLCOPT, comments, blank lines, etc.)
    }
    console.log(`Parsed ${channels.length} channels.`);
    return channels;
}