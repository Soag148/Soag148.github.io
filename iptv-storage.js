// --- Constants ---
export const STORAGE_KEYS = {
    M3U_URL: 'iptv_m3u_url',
    WATCHED_DATA: 'iptv_watched_data',
    FAVORITES: 'iptv_favorites'
};

const MAX_CONTINUE_WATCHING = 10;
const MAX_WATCHED_HISTORY = 100; // Limit total history stored

// --- State (exported for read-only access where needed) ---
export let watchedData = {}; // Store { url: { position: seconds, timestamp: Date.now(), name: 'Optional Name', logo: 'Optional Logo' } }
export let favorites = new Set(); // Store favorite channel URLs

// --- Functions ---

/**
 * Loads state (M3U URL, watched data, favorites) from localStorage.
 * @param {HTMLInputElement} m3uUrlInput - The input element for the M3U URL.
 * @returns {string|null} The loaded M3U URL, if any.
 */
export function loadFromLocalStorage(m3uUrlInput) {
    let loadedUrl = null;
    const storedUrl = localStorage.getItem(STORAGE_KEYS.M3U_URL);
    if (storedUrl) {
        m3uUrlInput.value = storedUrl;
        loadedUrl = storedUrl;
        console.log("Loaded M3U URL from localStorage:", storedUrl);
    }

    const storedWatchedData = localStorage.getItem(STORAGE_KEYS.WATCHED_DATA);
    if (storedWatchedData) {
        try {
            watchedData = JSON.parse(storedWatchedData);
            console.log("Loaded watched data from localStorage.");
        } catch (e) {
            console.error("Error parsing watched data from localStorage:", e);
            watchedData = {};
        }
    }

    const storedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    if (storedFavorites) {
        try {
            favorites = new Set(JSON.parse(storedFavorites));
            console.log("Loaded favorites from localStorage.");
        } catch (e) {
            console.error("Error parsing favorites from localStorage:", e);
            favorites = new Set();
        }
    }
    return loadedUrl;
}

/**
 * Saves the current state (M3U URL, watched data, favorites) to localStorage.
 * @param {string} currentM3uUrl - The current M3U URL to save.
 * @param {Array} channels - The current list of channels (used to enrich watched data).
 */
export function saveToLocalStorage(currentM3uUrl, channels) {
    if (currentM3uUrl) {
        localStorage.setItem(STORAGE_KEYS.M3U_URL, currentM3uUrl);
    }

    // Enrich watched data with names/logos if missing
    Object.keys(watchedData).forEach(url => {
        if (!watchedData[url].name || !watchedData[url].logo) {
            const channel = channels.find(c => c.url === url);
            if (channel) {
                 watchedData[url].name = watchedData[url].name || channel.name;
                 watchedData[url].logo = watchedData[url].logo || channel.logo;
            }
        }
    });

    localStorage.setItem(STORAGE_KEYS.WATCHED_DATA, JSON.stringify(watchedData));
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(Array.from(favorites)));
    console.log("Saved state to localStorage.");
}

/**
 * Updates or removes an entry in the watched data.
 * @param {string} url - The URL of the watched item.
 * @param {number} position - The current playback position in seconds.
 * @param {number} duration - The total duration of the video in seconds.
 * @param {string} name - The name of the channel/stream.
 * @param {string|null} logo - The logo URL of the channel/stream.
 * @returns {boolean} - True if the continue watching list needs re-rendering, false otherwise.
 */
export function updateWatchedData(url, position, duration, name, logo) {
    if (!url) return false;

    const isNearEnd = duration > 0 && position >= duration - 10; // Consider finished if within 10s of end or duration is known and positive
    const isNearBeginning = position <= 5;
    const isSignificant = !isNearBeginning && !isNearEnd;
    let needsRenderUpdate = false;

    if (isSignificant) {
        const existing = watchedData[url] || {};
        // Only update if position changed significantly (e.g., > 5s) or if it's a new entry
        if (!existing.position || Math.abs(existing.position - position) > 5) {
            watchedData[url] = {
                position: position,
                timestamp: Date.now(),
                name: name || existing.name || 'Unknown Channel',
                logo: logo || existing.logo
            };

            // Limit the size of watchedData
            const keys = Object.keys(watchedData);
            if (keys.length > MAX_WATCHED_HISTORY) {
                keys.sort((a, b) => watchedData[a].timestamp - watchedData[b].timestamp); // Sort oldest first
                const keysToRemove = keys.slice(0, keys.length - MAX_WATCHED_HISTORY);
                keysToRemove.forEach(key => delete watchedData[key]);
            }
            needsRenderUpdate = true; // List order or content might change
        }
        // Update timestamp even if position hasn't changed much, keeps it fresh
         if (watchedData[url]) watchedData[url].timestamp = Date.now();

    } else if ((isNearBeginning || isNearEnd) && watchedData[url]) {
        // Remove if playback finished, reset, or near the beginning/end
        console.log(`Removing ${url} from continue watching (position: ${position}, duration: ${duration})`);
        delete watchedData[url];
        needsRenderUpdate = true; // Item removed
    }

    // We don't save to localStorage here on every update for performance.
    // Saving happens on pause, end, unload, or after loading M3U.
    return needsRenderUpdate;
}

/**
 * Toggles a channel's favorite status.
 * @param {string} url - The channel URL.
 * @returns {boolean} - True if the item is now a favorite, false otherwise.
 */
export function toggleFavorite(url) {
    let isFavorite;
    if (favorites.has(url)) {
        favorites.delete(url);
        isFavorite = false;
    } else {
        favorites.add(url);
        isFavorite = true;
    }
    // Note: saveToLocalStorage should be called separately after this.
    return isFavorite;
}

/**
 * Gets the list of watched items, sorted and limited.
 * @returns {Array} - Sorted and limited list of watched items.
 */
export function getContinueWatchingItems() {
     return Object.entries(watchedData)
        .map(([url, data]) => ({ url, ...data }))
        .sort((a, b) => b.timestamp - a.timestamp) // Sort newest first
        .slice(0, MAX_CONTINUE_WATCHING); // Limit items
}