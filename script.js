const m3uUrlInput = document.getElementById('m3u-url');
const loadM3uButton = document.getElementById('load-m3u');
const channelListDiv = document.getElementById('channel-list');
const videoPlayer = document.getElementById('video-player');
const currentChannelInfoDiv = document.getElementById('current-channel-info');
const continueWatchingDiv = document.getElementById('continue-watching');
const favoritesListDiv = document.getElementById('favorites-list'); // New element

let hls = null;
let channels = [];
let watchedData = {}; // Store { url: { position: seconds, timestamp: Date.now(), name: 'Optional Name', logo: 'Optional Logo' } }
let favorites = new Set(); // Store favorite channel URLs

const MAX_CONTINUE_WATCHING = 10; // Max items in continue watching list

// --- LocalStorage ---
const STORAGE_KEYS = {
    M3U_URL: 'iptv_m3u_url',
    WATCHED_DATA: 'iptv_watched_data',
    FAVORITES: 'iptv_favorites', // New key for favorites
    M3U_PLAYLISTS: 'm3uPlaylists' // New key for playlists
};

// SVG Star Icon for Favorites
const starSVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z"/></svg>`;
const emptyStarSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

// Gestión de listas M3U
let playlists = JSON.parse(localStorage.getItem(STORAGE_KEYS.M3U_PLAYLISTS)) || [];

function savePlaylists() {
    localStorage.setItem(STORAGE_KEYS.M3U_PLAYLISTS, JSON.stringify(playlists));
}

function addPlaylist(url, name = '') {
    if (!name) {
        name = `Lista ${playlists.length + 1}`;
    }
    playlists.push({ url, name });
    savePlaylists();
    renderPlaylists();
    
    // Limpiar el campo de entrada después de añadir la lista
    m3uUrlInput.value = '';
}

function removePlaylist(index) {
    // Obtener la URL de la lista que se va a eliminar
    const playlistToRemove = playlists[index];
    
    // Eliminar la lista del array
    playlists.splice(index, 1);
    savePlaylists();
    renderPlaylists();
    
    // Limpiar los canales de TV en vivo si la lista eliminada es la que está actualmente cargada
    if (playlistToRemove && channels.length > 0) {
        // Verificar si hay canales que coincidan con la URL de la lista eliminada
        const channelsFromRemovedPlaylist = channels.filter(channel => {
            // Comprobar si la URL del canal contiene la URL de la lista
            return channel.url.includes(playlistToRemove.url) || 
                   playlistToRemove.url.includes(channel.url);
        });
        
        if (channelsFromRemovedPlaylist.length > 0) {
            // Si hay canales de esta lista, limpiar todos los canales
            channels = [];
            renderChannelList();
            renderFavoritesList();
            renderContinueWatching();
            
            // Actualizar la información del canal actual
            currentChannelInfoDiv.innerHTML = '<p>Seleccione un canal para comenzar a reproducir.</p>';
            
            // Detener la reproducción si hay un video en curso
            if (videoPlayer.src) {
                videoPlayer.pause();
                videoPlayer.src = '';
            }
            
            console.log(`Se eliminaron ${channelsFromRemovedPlaylist.length} canales de la lista eliminada`);
        }
    }
}

function renderPlaylists() {
    const playlistList = document.getElementById('playlist-list');
    playlistList.innerHTML = '';
    
    playlists.forEach((playlist, index) => {
        const playlistItem = document.createElement('div');
        playlistItem.className = 'playlist-item';
        playlistItem.innerHTML = `
            <span>${playlist.name}</span>
            <div class="playlist-item-actions">
                <button onclick="loadPlaylist('${playlist.url}')" class="secondary-button">Cargar</button>
                <button onclick="removePlaylist(${index})" class="secondary-button">Eliminar</button>
            </div>
        `;
        playlistList.appendChild(playlistItem);
    });
}

function loadFromLocalStorage() {
    const storedUrl = localStorage.getItem(STORAGE_KEYS.M3U_URL);
    if (storedUrl) {
        m3uUrlInput.value = storedUrl;
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
    renderContinueWatching();
    renderFavoritesList(); // Render favorites even before M3U load
}

function saveToLocalStorage() {
    if (m3uUrlInput.value) {
        localStorage.setItem(STORAGE_KEYS.M3U_URL, m3uUrlInput.value);
    }
    // Add basic info like name/logo to watched data for display when channel list changes
    Object.keys(watchedData).forEach(url => {
        const channel = channels.find(c => c.url === url);
        if (channel && !watchedData[url].name) {
            watchedData[url].name = channel.name;
            watchedData[url].logo = channel.logo;
        }
    });

    localStorage.setItem(STORAGE_KEYS.WATCHED_DATA, JSON.stringify(watchedData));
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(Array.from(favorites))); // Save favorites as array
    console.log("Saved watched data and favorites to localStorage.");
}

function updateWatchedData(url, position, name, logo) {
    if (!url) return;
    const duration = videoPlayer.duration;
    const isNearEnd = duration && position >= duration - 10; // Consider finished if within 10s of end
    const isSignificant = position > 5 && !isNearEnd;

    if (isSignificant) {
        // Update or add entry
        const existing = watchedData[url] || {};
        watchedData[url] = {
            position: position,
            timestamp: Date.now(),
            name: name || existing.name || 'Unknown Channel', // Persist name/logo if available
            logo: logo || existing.logo
        };

        // Limit the size of watchedData (e.g., keep latest 100)
        const keys = Object.keys(watchedData);
        if (keys.length > 100) {
            keys.sort((a, b) => watchedData[a].timestamp - watchedData[b].timestamp); // Sort oldest first
            const keysToRemove = keys.slice(0, keys.length - 100);
            keysToRemove.forEach(key => delete watchedData[key]);
        }

        saveToLocalStorage();
        renderContinueWatching(); // Update the list
    } else if ((position <= 5 || isNearEnd) && watchedData[url]) {
        // Remove if playback finished, reset, or near the end
        console.log(`Removing ${url} from continue watching (position: ${position}, duration: ${duration})`);
        delete watchedData[url];
        saveToLocalStorage();
        renderContinueWatching();
    }
}

// --- M3U Parsing ---
async function loadM3U(url) {
    if (!url) {
        alert("Por favor, ingrese una URL M3U válida.");
        return;
    }
    channelListDiv.innerHTML = '<p>Cargando TV en Vivo...</p>'; // Update text
    favoritesListDiv.innerHTML = '<p>Cargando favoritos...</p>'; // Update text
    continueWatchingDiv.innerHTML = '<p>Cargando historial...</p>'; // Update text
    currentChannelInfoDiv.innerHTML = '';
    channels = []; // Clear previous channels

    try {
        // Usar un proxy CORS para evitar problemas de acceso
        const proxyUrl = 'https://corsproxy.io/?';
        const response = await fetch(proxyUrl + encodeURIComponent(url));

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const m3uText = await response.text();
        parseM3U(m3uText);
        renderChannelList();
        renderFavoritesList(); // Render favorites based on newly loaded channels
        renderContinueWatching(); // Re-render continue watching to potentially update names
        saveToLocalStorage(); // Save the successfully loaded URL and potentially updated watched data names
        console.log("Playlist loaded successfully.");
        
        // Limpiar el campo de entrada de URL después de cargar exitosamente
        m3uUrlInput.value = '';

    } catch (error) {
        console.error("Error loading M3U:", error);
        const errorMsg = `Error al cargar la lista: ${error.message}.`;
        channelListDiv.innerHTML = `<p>${errorMsg}</p>`;
        favoritesListDiv.innerHTML = `<p>No se pueden cargar favoritos sin una lista.</p>`; // Clear favorites on error
    }
}

// ... (parseM3U function remains the same) ...
function parseM3U(m3uText) {
    const lines = m3uText.split('\n');
    let currentChannel = {};
    let firstLine = true;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (firstLine && !trimmedLine.startsWith('#EXTM3U')) {
            console.warn("Playlist doesn't start with #EXTM3U. Trying to parse anyway.");
        }
        firstLine = false;

        if (trimmedLine.startsWith('#EXTINF:')) {
            // Reset for new channel info
            currentChannel = { url: null, name: 'Unknown', group: 'Uncategorized', logo: null, rawInf: trimmedLine };

            const infoLine = trimmedLine.substring(8); // Remove '#EXTINF:'
            const commaIndex = infoLine.lastIndexOf(',');
            const metadata = infoLine.substring(0, commaIndex);
            currentChannel.name = infoLine.substring(commaIndex + 1);

            // Try to extract attributes like tvg-id, tvg-logo, group-title
            const groupMatch = metadata.match(/group-title="([^"]+)"/);
            if (groupMatch) currentChannel.group = groupMatch[1];

            const logoMatch = metadata.match(/tvg-logo="([^"]+)"/);
            if (logoMatch) currentChannel.logo = logoMatch[1];

            // Add other attributes if needed (tvg-id, etc.)

        } else if (trimmedLine && !trimmedLine.startsWith('#')) {
            if (currentChannel.name) { // Ensure we have preceding #EXTINF
                currentChannel.url = trimmedLine;
                channels.push(currentChannel);
                currentChannel = {}; // Reset for the next one
            }
        } else if (trimmedLine.startsWith('#EXTGRP:')) {
            // Alternative group definition (less common now)
            // Apply this group to subsequent channels until a new #EXTGRP or group-title=""
            // Note: group-title in #EXTINF usually takes precedence.
            // Simple implementation: apply to the *next* channel found.
            if (currentChannel.name && !currentChannel.group) { // Only if not already set by EXTINF
                currentChannel.group = trimmedLine.substring(8);
            }
            // More robust handling might be needed depending on M3U variations.
        }
        // Ignore other lines (#EXTVLCOPT, comments, etc.) for now
    }
    console.log(`Parsed ${channels.length} channels.`);
}

// --- UI Rendering ---
function renderChannelList() {
    if (channels.length === 0) {
        channelListDiv.innerHTML = '<p>No se encontraron canales en la lista.</p>';
        return;
    }

    const groups = channels.reduce((acc, channel) => {
        const groupName = channel.group || 'Sin Categoría';
        if (!acc[groupName]) {
            acc[groupName] = [];
        }
        acc[groupName].push(channel);
        return acc;
    }, {});

    channelListDiv.innerHTML = ''; // Limpiar lista anterior
    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
        // Intentar convertir los nombres de grupo a números para ordenar correctamente
        const numA = parseInt(a);
        const numB = parseInt(b);
        
        // Si ambos son números, ordenar en orden descendente
        if (!isNaN(numA) && !isNaN(numB)) {
            return numB - numA; // Orden descendente
        }
        
        // Si solo uno es número, poner los números primero
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;
        
        // Si ninguno es número, ordenar alfabéticamente
        return a.localeCompare(b);
    });

    sortedGroupNames.forEach(groupName => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'channel-group collapsed'; // Iniciar colapsado

        const titleDiv = document.createElement('div');
        titleDiv.className = 'channel-group-title';
        titleDiv.textContent = groupName;
        titleDiv.onclick = () => groupDiv.classList.toggle('collapsed'); // Alternar colapso

        const itemsUl = document.createElement('ul');
        itemsUl.className = 'channel-group-items';

        groups[groupName].sort((a, b) => a.name.localeCompare(b.name)).forEach(channel => {
            const li = document.createElement('li');
            li.className = 'channel-item';
            li.dataset.url = channel.url; // Almacenar URL en atributo de datos
            li.dataset.name = channel.name;
            li.dataset.logo = channel.logo || '';
            li.title = channel.name; // Tooltip para nombres largos

            const channelNameSpan = document.createElement('span');
            channelNameSpan.textContent = channel.name;
            channelNameSpan.style.flexGrow = '1'; // Permitir que el nombre ocupe espacio

            const favoriteButton = document.createElement('button');
            favoriteButton.className = 'favorite-button';
            favoriteButton.innerHTML = favorites.has(channel.url) ? starSVG : emptyStarSVG;
            favoriteButton.onclick = () => {
                if (favorites.has(channel.url)) {
                    favorites.delete(channel.url);
                    favoriteButton.innerHTML = emptyStarSVG;
                } else {
                    favorites.add(channel.url);
                    favoriteButton.innerHTML = starSVG;
                }
                saveToLocalStorage();
                renderFavoritesList();
            };

            li.appendChild(channelNameSpan);
            li.appendChild(favoriteButton);
            li.onclick = () => playChannel(channel);
            itemsUl.appendChild(li);
        });

        groupDiv.appendChild(titleDiv);
        groupDiv.appendChild(itemsUl);
        channelListDiv.appendChild(groupDiv);
    });
}

function renderContinueWatching() {
    const watchedItems = Object.entries(watchedData)
        .map(([url, data]) => ({ url, ...data }))
        .sort((a, b) => b.timestamp - a.timestamp) // Sort newest first
        .slice(0, MAX_CONTINUE_WATCHING); // Limit items

    continueWatchingDiv.innerHTML = ''; // Clear previous

    if (watchedItems.length === 0) {
        continueWatchingDiv.innerHTML = '<p>No hay artículos vistos recientemente.</p>';
        return;
    }

    const itemsUl = document.createElement('ul');
    itemsUl.style.listStyle = 'none'; // Remove list bullets
    itemsUl.style.paddingLeft = '0';

    watchedItems.forEach(item => {
        // Find the channel info for the name (could be slow for huge lists)
        // Optimization: Could store name/logo in watchedData too
        const channelInfo = channels.find(c => c.url === item.url);
        const name = channelInfo ? channelInfo.name : 'Unknown Channel';
        const positionFormatted = new Date(item.position * 1000).toISOString().substr(11, 8); // HH:MM:SS

        const li = document.createElement('li');
        li.className = 'continue-item';
        li.textContent = `${name} (${positionFormatted})`;
        li.title = `${name} - Resume at ${positionFormatted}`;
        li.dataset.url = item.url;
        li.dataset.position = item.position;
        li.onclick = () => {
            const channelToPlay = channels.find(c => c.url === item.url);
            if (channelToPlay) {
                playChannel(channelToPlay, item.position);
            } else {
                // Fallback if channel not in current list - maybe just play URL?
                // This happens if user loads a different M3U
                console.warn("Channel for continue watching not found in current playlist:", item.url);
                // We could potentially try to play the URL directly if needed
                playStream(item.url, name, null, item.position);
            }

        };
        itemsUl.appendChild(li);
    });
    continueWatchingDiv.appendChild(itemsUl);

}

function renderFavoritesList() {
    favoritesListDiv.innerHTML = ''; // Clear previous

    if (channels.length === 0) {
        favoritesListDiv.innerHTML = '<p>No hay canales favoritos.</p>';
        return;
    }

    if (favorites.size === 0) {
        favoritesListDiv.innerHTML = '<p>No favorite channels.</p>';
        return;
    }

    const itemsUl = document.createElement('ul');
    itemsUl.style.listStyle = 'none'; // Remove list bullets
    itemsUl.style.paddingLeft = '0';

    channels.forEach(channel => {
        if (favorites.has(channel.url)) {
            const li = document.createElement('li');
            li.className = 'favorite-item';
            li.textContent = channel.name;
            li.dataset.url = channel.url;
            li.onclick = () => playChannel(channel);
            itemsUl.appendChild(li);
        }
    });

    favoritesListDiv.appendChild(itemsUl);
}

// --- Playback ---
function setupHls(url) {
    if (hls) {
        hls.destroy();
    }
    hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(videoPlayer);
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
        console.log("Manifest parsed, attempting to play.");
        videoPlayer.play().catch(e => console.error("Autoplay failed:", e));
    });
    hls.on(Hls.Events.ERROR, function (event, data) {
        if (data.fatal) {
            switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                    console.error("fatal network error encountered, try stopping/restarting playback", data);
                    // maybe retry loading?
                    break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                    console.error("fatal media error encountered, try stopping/restarting playback", data);
                    // Can try to recover media error
                    hls.recoverMediaError();
                    break;
                default:
                    console.error("fatal error encountered", data);
                    // cannot recover
                    hls.destroy();
                    currentChannelInfoDiv.innerHTML = `<p>Error playing channel: ${data.details || 'Unknown HLS error'}</p>`;
                    break;
            }
        } else {
            console.warn("Non-fatal HLS error:", data);
        }
    });
}

function playStream(url, name = 'Stream', logo = null, startTime = 0) {
    console.log(`Playing: ${name} (${url}) starting at ${startTime}s`);
    
    // Ocultar la tarjeta de información inicialmente
    currentChannelInfoDiv.style.display = 'none';
    
    // Crear o actualizar el botón para mostrar la información
    let infoButton = document.getElementById('show-channel-info');
    if (!infoButton) {
        infoButton = document.createElement('button');
        infoButton.id = 'show-channel-info';
        infoButton.className = 'info-button';
        infoButton.innerHTML = '📺';
        infoButton.title = 'Mostrar información del canal';
        infoButton.onclick = () => {
            if (currentChannelInfoDiv.style.display === 'none') {
                currentChannelInfoDiv.style.display = 'block';
                infoButton.innerHTML = '❌';
                infoButton.title = 'Ocultar información del canal';
            } else {
                currentChannelInfoDiv.style.display = 'none';
                infoButton.innerHTML = '📺';
                infoButton.title = 'Mostrar información del canal';
            }
        };
        
        // Añadir el botón al contenedor de video
        const videoContainer = document.querySelector('.video-container');
        videoContainer.appendChild(infoButton);
    }

    // Stop previous playback and clear source
    if (hls) {
        hls.stopLoad();
        hls.detachMedia();
    }
    videoPlayer.src = ''; // Clear previous source/poster

    // Check if it's likely an HLS stream
    if (url.includes('.m3u8') || url.includes('manifest')) {
        if (Hls.isSupported()) {
            setupHls(url);
        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari, iOS)
            videoPlayer.src = url;
            videoPlayer.load(); // Necessary for Safari sometimes
            // Autoplay handled by `onplaying` or `loadedmetadata`/`canplay` events later
            // videoPlayer.play().catch(e => console.error("Autoplay failed:", e)); // Removed duplicate play call
        } else {
            alert("HLS playback is not supported in this browser.");
            currentChannelInfoDiv.innerHTML = `<p>HLS not supported.</p>`;
            // No mostrar la tarjeta de información en caso de error
            return;
        }
    } else {
        // Assume direct video file (MP4, WebM, etc.) or other supported type
        videoPlayer.src = url;
        videoPlayer.load(); // Start loading
        // Autoplay handled by `onplaying` or `loadedmetadata`/`canplay` events later
        // videoPlayer.play().catch(e => console.error("Autoplay failed:", e)); // Removed duplicate play call
    }

    // Handle seeking after metadata loaded
    const seekHandler = () => {
        console.log("Video metadata loaded or ready to play.");
        if (startTime > 0 && videoPlayer.seekable.length > 0) {
            // Check if startTime is within seekable range
            const seekableEnd = videoPlayer.seekable.end(videoPlayer.seekable.length - 1);
            if (startTime < seekableEnd) {
                console.log(`Seeking to ${startTime}s`);
                videoPlayer.currentTime = startTime;
            } else {
                console.warn(`Start time ${startTime}s is beyond seekable range (${seekableEnd}s). Starting from beginning.`);
            }
        }
        // Attempt to play *after* potential seeking
        videoPlayer.play().catch(e => {
            // Autoplay might be blocked, inform the user.
            console.error("Autoplay was prevented:", e);
            currentChannelInfoDiv.innerHTML = `<p>Playing: ${name} (Click play if needed)</p>`;
            // No mostrar la tarjeta de información en caso de error
        });
        videoPlayer.removeEventListener('loadedmetadata', seekHandler);
        videoPlayer.removeEventListener('canplay', seekHandler); // Also listen for canplay
    };
    videoPlayer.addEventListener('loadedmetadata', seekHandler);
    videoPlayer.addEventListener('canplay', seekHandler); // In case metadata fires too early

    // Update info display when playing starts & Request Fullscreen
    videoPlayer.onplaying = () => {
        // No mostrar la tarjeta de información automáticamente
        currentChannelInfoDiv.innerHTML = `<p>Playing: ${name}</p>`;
        // Highlight the active channel in the list
        document.querySelectorAll('.channel-item.active').forEach(el => el.classList.remove('active'));
        const activeItem = channelListDiv.querySelector(`.channel-item[data-url="${url}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            // Scroll sidebar to show the active item
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // -- START: Request Fullscreen --
        // Check if fullscreen is available and not already active
        if (videoPlayer.requestFullscreen && !document.fullscreenElement) {
            videoPlayer.requestFullscreen()
                .then(() => console.log("Entered fullscreen successfully"))
                .catch(err => {
                    console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                });
        } else if (videoPlayer.webkitRequestFullscreen && !document.webkitFullscreenElement) { // Safari
            videoPlayer.webkitRequestFullscreen()
                .then(() => console.log("Entered fullscreen successfully (webkit)"))
                .catch(err => {
                    console.error(`Error attempting to enable full-screen mode (webkit): ${err.message} (${err.name})`);
                });
        } else if (videoPlayer.mozRequestFullScreen && !document.mozFullScreenElement) { // Firefox
             videoPlayer.mozRequestFullScreen()
                .then(() => console.log("Entered fullscreen successfully (moz)"))
                .catch(err => {
                    console.error(`Error attempting to enable full-screen mode (moz): ${err.message} (${err.name})`);
                });
        } else if (videoPlayer.msRequestFullscreen && !document.msFullscreenElement) { // IE/Edge
             videoPlayer.msRequestFullscreen()
                .then(() => console.log("Entered fullscreen successfully (ms)"))
                .catch(err => {
                    console.error(`Error attempting to enable full-screen mode (ms): ${err.message} (${err.name})`);
                });
        }
        // -- END: Request Fullscreen --
    };

    // Save progress periodically
    videoPlayer.ontimeupdate = () => {
        // Throttle saving to avoid excessive writes
        if (!videoPlayer.paused && videoPlayer.currentTime > 0 && videoPlayer.duration > 0) {
            // Save roughly every 10 seconds
            if (!videoPlayer._lastSaveTime || (Date.now() - videoPlayer._lastSaveTime > 10000)) {
                const channel = channels.find(c => c.url === url);
                const name = channel ? channel.name : 'Unknown Channel';
                const logo = channel ? channel.logo : null;
                updateWatchedData(url, videoPlayer.currentTime, name, logo);
                videoPlayer._lastSaveTime = Date.now();
            }
        }
    };
    // Also save when paused or ended
    videoPlayer.onpause = () => {
        const channel = channels.find(c => c.url === url);
        const name = channel ? channel.name : 'Unknown Channel';
        const logo = channel ? channel.logo : null;
        updateWatchedData(url, videoPlayer.currentTime, name, logo);
    };
    videoPlayer.onended = () => {
        const channel = channels.find(c => c.url === url);
        const name = channel ? channel.name : 'Unknown Channel';
        const logo = channel ? channel.logo : null;
        
        // Eliminar de la lista de "Continuar Viendo" cuando termina la reproducción
        if (watchedData[url]) {
            console.log(`Eliminando ${name} de la lista de "Continuar Viendo" porque terminó la reproducción`);
            delete watchedData[url];
            saveToLocalStorage();
            renderContinueWatching();
        }
        
        // Actualizar la información del canal actual
        currentChannelInfoDiv.innerHTML = `<p>Reproducción finalizada: ${name}</p>`;
        
        // Reproducción continua: reproducir el siguiente canal automáticamente
        playNextChannel(url);
    };
    videoPlayer.onabort = () => {
        const channel = channels.find(c => c.url === url);
        const name = channel ? channel.name : 'Unknown Channel';
        const logo = channel ? channel.logo : null;
        updateWatchedData(url, videoPlayer.currentTime, name, logo); // Save if loading is aborted
    };
}

// Función para reproducir el siguiente canal automáticamente
function playNextChannel(currentUrl) {
    console.log(`Buscando el siguiente canal después de: ${currentUrl}`);
    
    // Encontrar el canal actual en la lista
    const currentIndex = channels.findIndex(channel => channel.url === currentUrl);
    
    if (currentIndex === -1) {
        console.log("No se encontró el canal actual en la lista");
        return;
    }
    
    // Obtener el siguiente canal (o volver al principio si es el último)
    const nextIndex = (currentIndex + 1) % channels.length;
    const nextChannel = channels[nextIndex];
    
    console.log(`Reproduciendo el siguiente canal: ${nextChannel.name}`);
    
    // Reproducir el siguiente canal
    playChannel(nextChannel);
}

// Flag to ensure the beforeunload listener is added only once
let beforeUnloadListenerAdded = false;

function playChannel(channel, startTime = 0) {
    if (!channel || !channel.url) {
        console.error("Invalid channel object provided.");
        return;
    }
    const resumePosition = watchedData[channel.url]?.position;
    const effectiveStartTime = startTime > 0 ? startTime : (resumePosition || 0);

    // Asegurar que la tarjeta de información esté oculta antes de reproducir
    currentChannelInfoDiv.style.display = 'none';
    
    playStream(channel.url, channel.name, channel.logo, effectiveStartTime);

    // Add the beforeunload listener if it hasn't been added yet
    // It should save the state of the *currently playing* video
    if (!beforeUnloadListenerAdded) {
        window.addEventListener('beforeunload', () => {
            if (!videoPlayer.paused && videoPlayer.currentSrc) { // Check if something is actually playing
                 const currentUrl = videoPlayer.currentSrc;
                 const currentChannel = channels.find(c => c.url === currentUrl);
                 const name = currentChannel ? currentChannel.name : 'Unknown Stream';
                 const logo = currentChannel ? currentChannel.logo : null;
                 updateWatchedData(currentUrl, videoPlayer.currentTime, name, logo); // Save current video state
            }
        });
        beforeUnloadListenerAdded = true;
    }
}

// --- Event Listeners ---
loadM3uButton.addEventListener('click', () => loadM3U(m3uUrlInput.value));
m3uUrlInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        loadM3U(m3uUrlInput.value);
    }
});

// Event Listeners
document.getElementById('add-playlist').addEventListener('click', () => {
    const url = document.getElementById('m3u-url').value;
    if (url) {
        const name = prompt('Nombre para la lista (opcional):');
        addPlaylist(url, name);
    } else {
        alert('Por favor, ingresa una URL válida');
    }
});

function managePlaylists() {
    const playlistList = document.getElementById('playlist-list');
    const currentContent = playlistList.innerHTML;
    
    // Crear el modal de gestión
    const modal = document.createElement('div');
    modal.className = 'playlist-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Gestionar Listas M3U</h3>
            <div class="modal-actions">
                <button id="delete-all-playlists" class="danger-button">Eliminar Todas las Listas</button>
                <button id="close-modal" class="secondary-button">Cerrar</button>
            </div>
            <div class="playlist-list-detailed">
                ${playlists.map((playlist, index) => `
                    <div class="playlist-item-detailed">
                        <span>${playlist.name}</span>
                        <span class="playlist-url">${playlist.url}</span>
                        <button onclick="removePlaylist(${index})" class="danger-button">Eliminar</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Añadir el modal al documento
    document.body.appendChild(modal);

    // Event listeners para los botones del modal
    document.getElementById('delete-all-playlists').addEventListener('click', () => {
        if (confirm('¿Estás seguro de que deseas eliminar todas las listas? Esta acción no se puede deshacer.')) {
            // Limpiar todos los canales de TV en vivo
            channels = [];
            renderChannelList();
            renderFavoritesList();
            renderContinueWatching();
            
            // Actualizar la información del canal actual
            currentChannelInfoDiv.innerHTML = '<p>Seleccione un canal para comenzar a reproducir.</p>';
            
            // Detener la reproducción si hay un video en curso
            if (videoPlayer.src) {
                videoPlayer.pause();
                videoPlayer.src = '';
            }
            
            // Eliminar todas las listas
            playlists = [];
            savePlaylists();
            renderPlaylists();
            modal.remove();
            
            console.log('Se eliminaron todas las listas y se limpiaron los canales de TV en vivo');
        }
    });

    document.getElementById('close-modal').addEventListener('click', () => {
        modal.remove();
    });
}

// Actualizar el event listener del botón de gestión
document.getElementById('manage-playlists').addEventListener('click', managePlaylists);

// Modificar la función loadPlaylist para usar el proxy CORS
async function loadPlaylist(url) {
    try {
        // Usar un proxy CORS para evitar problemas de acceso
        const proxyUrl = 'https://corsproxy.io/?';
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const content = await response.text();
        parseM3U(content);
        renderChannelList();
        renderFavoritesList();
        renderContinueWatching();
        console.log("Playlist loaded successfully.");
    } catch (error) {
        console.error('Error loading playlist:', error);
        alert(`Error al cargar la lista M3U: ${error.message}`);
    }
}

// Eliminar el logo de websim de forma más agresiva
function removeWebsimLogo() {
    // Intentar eliminar el elemento si existe
    const websimLogo = document.getElementById('websim-logo-container');
    if (websimLogo) {
        websimLogo.remove();
        console.log('Logo de websim eliminado');
    }
    
    // También intentar eliminar cualquier otro elemento relacionado con websim
    const websimElements = document.querySelectorAll('[id^="websim-"], [class^="websim-"], [class*=" websim-"]');
    websimElements.forEach(element => {
        element.remove();
        console.log(`Elemento ${element.id || element.className} eliminado`);
    });
    
    // Eliminar scripts de websim
    const websimScripts = document.querySelectorAll('script[src*="websim.ai"], script[class*="websim"]');
    websimScripts.forEach(script => {
        script.remove();
        console.log('Script de websim eliminado');
    });
    
    // Eliminar estilos de websim
    const websimStyles = document.querySelectorAll('link[href*="websim.ai"]');
    websimStyles.forEach(style => {
        style.remove();
        console.log('Estilo de websim eliminado');
    });
}

// Función para observar cambios en el DOM y eliminar elementos de websim
function setupWebsimObserver() {
    // Crear un observador de mutaciones para detectar cambios en el DOM
    const observer = new MutationObserver((mutations) => {
        let shouldRemove = false;
        
        // Verificar si hay nuevos nodos añadidos
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                shouldRemove = true;
            }
        });
        
        // Si se detectaron cambios, eliminar elementos de websim
        if (shouldRemove) {
            removeWebsimLogo();
        }
    });
    
    // Configurar el observador para vigilar todo el documento
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    
    console.log('Observador de websim configurado');
}

// Modificar el evento DOMContentLoaded para ocultar la tarjeta de carga de listas inicialmente
document.addEventListener('DOMContentLoaded', () => {
    // Eliminar el logo de websim inmediatamente
    removeWebsimLogo();
    
    // Configurar el observador para eliminar elementos de websim que se añadan después
    setupWebsimObserver();
    
    // También ejecutar periódicamente para asegurarse de que se elimine
    setInterval(removeWebsimLogo, 1000);
    
    // Asegurar que la tarjeta de información esté oculta al inicio
    currentChannelInfoDiv.style.display = 'none';
    
    // Ocultar la tarjeta de carga de listas inicialmente
    const playlistLoader = document.querySelector('.playlist-loader');
    playlistLoader.style.display = 'none';
    
    // Crear o actualizar el botón para mostrar/ocultar la tarjeta de carga de listas
    let playlistButton = document.getElementById('toggle-playlist-loader');
    if (!playlistButton) {
        playlistButton = document.createElement('button');
        playlistButton.id = 'toggle-playlist-loader';
        playlistButton.className = 'playlist-toggle-button';
        playlistButton.innerHTML = '📋';
        playlistButton.title = 'Mostrar/Ocultar Carga de Listas';
        playlistButton.onclick = () => {
            if (playlistLoader.style.display === 'none') {
                playlistLoader.style.display = 'block';
                playlistButton.innerHTML = '❌';
                playlistButton.title = 'Ocultar Carga de Listas';
            } else {
                playlistLoader.style.display = 'none';
                playlistButton.innerHTML = '📋';
                playlistButton.title = 'Mostrar Carga de Listas';
            }
        };
        
        // Añadir el botón al header
        const header = document.querySelector('header');
        header.appendChild(playlistButton);
    }
    
    // Cargar datos del localStorage
    loadFromLocalStorage();
    // Opcionalmente cargar automáticamente la URL M3U guardada
    if (m3uUrlInput.value) {
        console.log("Autoloading saved M3U URL...");
        loadM3U(m3uUrlInput.value);
    } else {
        renderContinueWatching(); // Still show continue watching even if no M3U loaded yet
    }
    renderPlaylists();
});