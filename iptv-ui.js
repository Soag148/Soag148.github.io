import { favorites, toggleFavorite, getContinueWatchingItems } from './iptv-storage.js';
import { playChannel } from './iptv-player.js'; 

// --- DOM Elements (Exported for potential use elsewhere, e.g., player) ---
export const channelListDiv = document.getElementById('channel-list');
export const continueWatchingDiv = document.getElementById('continue-watching');
export const favoritesListDiv = document.getElementById('favorites-list');
export const currentChannelInfoDiv = document.getElementById('current-channel-info');
export const videoPlayer = document.getElementById('video-player'); 

// --- SVG Icons ---
const starSVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z"/></svg>`;
const emptyStarSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
const chevronDownSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>`;
const chevronRightSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chevron-right" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>`;
const playIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-circle" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/></svg>`;

// --- UI Rendering Functions ---

/** Displays loading messages in relevant UI sections. */
export function displayLoading() {
    channelListDiv.innerHTML = '<p class="loading-msg"><span class="spinner"></span> Loading channels...</p>';
    favoritesListDiv.innerHTML = '<p class="loading-msg"><span class="spinner"></span> Loading favorites...</p>';
    continueWatchingDiv.innerHTML = '<p class="loading-msg"><span class="spinner"></span> Loading history...</p>';
    currentChannelInfoDiv.innerHTML = '';
}

/** Displays error messages in relevant UI sections. */
export function displayError(error) {
    console.error("Error loading M3U:", error);
    const errorMsg = `Error loading playlist: ${error.message}. Check URL and CORS policy.`;
    channelListDiv.innerHTML = `<p class="error-msg">${errorMsg}</p>`;
    favoritesListDiv.innerHTML = `<p class="error-msg">Cannot load favorites without playlist.</p>`;
    continueWatchingDiv.innerHTML = `<p class="error-msg">Cannot load history without playlist.</p>`;

    if (error.message.toLowerCase().includes('failed to fetch') || error.message.toLowerCase().includes('cors')) {
        channelListDiv.innerHTML += `<p class="info-msg">This might be a CORS issue. The player tried using a CORS proxy, but it might have failed or the resource is unavailable.</p>`;
    }
}

/** Renders the main channel list grouped by category. */
export function renderChannelList(channels, saveCallback) {
    if (!Array.isArray(channels)) {
         console.error("renderChannelList expects an array of channels.");
         channelListDiv.innerHTML = '<p class="error-msg">Error displaying channels.</p>';
         return;
     }
    if (channels.length === 0) {
        channelListDiv.innerHTML = '<p class="info-msg">No channels found in the playlist.</p>';
        return;
    }

    const groups = channels.reduce((acc, channel) => {
        const groupName = channel.group || 'Uncategorized';
        if (!acc[groupName]) {
            acc[groupName] = [];
        }
        acc[groupName].push(channel);
        return acc;
    }, {});

    channelListDiv.innerHTML = ''; 
    const sortedGroupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    sortedGroupNames.forEach(groupName => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'channel-group collapsed'; 

        const titleDiv = document.createElement('div');
        titleDiv.className = 'channel-group-title';
        titleDiv.onclick = () => {
             groupDiv.classList.toggle('collapsed');
             const icon = titleDiv.querySelector('.group-toggle-icon');
             icon.innerHTML = groupDiv.classList.contains('collapsed') ? chevronRightSVG : chevronDownSVG;
        };

        const groupNameSpan = document.createElement('span');
        groupNameSpan.textContent = groupName;

        const toggleIconSpan = document.createElement('span');
        toggleIconSpan.className = 'group-toggle-icon';
        toggleIconSpan.innerHTML = chevronRightSVG; 

        titleDiv.appendChild(groupNameSpan);
        titleDiv.appendChild(toggleIconSpan);


        const itemsUl = document.createElement('ul');
        itemsUl.className = 'channel-group-items';

        groups[groupName].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).forEach(channel => {
            const li = document.createElement('li');
            li.className = 'channel-item';
            li.dataset.url = channel.url;
            li.dataset.name = channel.name;
            li.dataset.logo = channel.logo || '';
            li.title = `${channel.name}\nGroup: ${channel.group || 'N/A'}\nURL: ${channel.url}`; 

            const channelNameSpan = document.createElement('span');
            channelNameSpan.className = 'channel-name';
            channelNameSpan.textContent = channel.name;

            const favoriteButton = document.createElement('button');
            favoriteButton.className = 'fav-button';
            favoriteButton.title = favorites.has(channel.url) ? 'Remove from favorites' : 'Add to favorites';
            favoriteButton.innerHTML = favorites.has(channel.url) ? starSVG : emptyStarSVG;

            favoriteButton.addEventListener('click', (event) => {
                 event.stopPropagation();
                 const isNowFavorite = toggleFavorite(channel.url);
                 favoriteButton.innerHTML = isNowFavorite ? starSVG : emptyStarSVG;
                 favoriteButton.title = isNowFavorite ? 'Remove from favorites' : 'Add to favorites';
                 saveCallback(); 
                 renderFavoritesList(channels, saveCallback); 
            });


            li.appendChild(channelNameSpan);
            li.appendChild(favoriteButton);

            li.addEventListener('click', () => {
                 playChannel(channel); 
            });

            itemsUl.appendChild(li);
        });

        groupDiv.appendChild(titleDiv);
        groupDiv.appendChild(itemsUl);
        channelListDiv.appendChild(groupDiv);
    });
}

/** Renders the "Continue Watching" list. */
export function renderContinueWatching(channels) {
    const watchedItems = getContinueWatchingItems(); 

    continueWatchingDiv.innerHTML = ''; 

    if (watchedItems.length === 0) {
        continueWatchingDiv.innerHTML = '<p class="info-msg">No recently watched items.</p>';
        return;
    }

    const itemsUl = document.createElement('ul');

    watchedItems.forEach(item => {
        const name = item.name || 'Unknown Channel';
        const positionFormatted = new Date(item.position * 1000).toISOString().substr(11, 8); 

        const li = document.createElement('li');
        li.className = 'continue-item';
        li.title = `${name} - Resume at ${positionFormatted}`;
        li.dataset.url = item.url;
        li.dataset.position = item.position;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'item-icon';
        iconSpan.innerHTML = playIconSVG;

        const textSpan = document.createElement('span');
        textSpan.className = 'item-text';
        textSpan.textContent = `${name} (${positionFormatted})`;


        li.appendChild(iconSpan);
        li.appendChild(textSpan);


        li.onclick = () => {
            const channelToPlay = channels.find(c => c.url === item.url);
            if (channelToPlay) {
                playChannel(channelToPlay, item.position); 
            } else {
                console.warn("Channel for continue watching not found in current playlist:", item.url);
                playChannel({ url: item.url, name: item.name, logo: item.logo }, item.position); 
            }
        };
        itemsUl.appendChild(li);
    });
    continueWatchingDiv.appendChild(itemsUl);
}

/** Renders the "Favorites" list. */
export function renderFavoritesList(channels, saveCallback) {
    favoritesListDiv.innerHTML = ''; 

    if (!Array.isArray(channels) || channels.length === 0) {
        favoritesListDiv.innerHTML = '<p class="info-msg">Load a playlist to see favorites.</p>';
        return;
    }

    const favoriteChannels = channels.filter(channel => favorites.has(channel.url));

    if (favoriteChannels.length === 0) {
        favoritesListDiv.innerHTML = '<p class="info-msg">No favorite channels yet.</p>';
        return;
    }

    const itemsUl = document.createElement('ul');

    favoriteChannels.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    favoriteChannels.forEach(channel => {
        const li = document.createElement('li');
        li.className = 'favorite-item';
        li.title = `${channel.name}\nGroup: ${channel.group || 'N/A'}`;
        li.dataset.url = channel.url;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'channel-name';
        nameSpan.textContent = channel.name;

        const removeButton = document.createElement('button');
        removeButton.className = 'fav-button remove-fav'; 
        removeButton.title = 'Remove from favorites';
        removeButton.innerHTML = starSVG; 

        removeButton.addEventListener('click', (event) => {
             event.stopPropagation(); 
             toggleFavorite(channel.url);
             saveCallback(); 
             renderFavoritesList(channels, saveCallback); 
             const mainListItem = channelListDiv.querySelector(`.channel-item[data-url="${channel.url}"] .fav-button`);
             if (mainListItem) {
                 mainListItem.innerHTML = emptyStarSVG;
                 mainListItem.title = 'Add to favorites';
             }
        });

        li.appendChild(nameSpan);
        li.appendChild(removeButton);


        li.onclick = () => playChannel(channel); 
        itemsUl.appendChild(li);
    });

    favoritesListDiv.appendChild(itemsUl);
}

/** Updates the currently playing info display */
export function updateCurrentChannelInfo(message, isError = false) {
     currentChannelInfoDiv.innerHTML = `<p class="${isError ? 'error-msg' : ''}">${message}</p>`;
}

/** Highlights the currently playing item in the channel list */
export function highlightActiveChannel(url) {
     document.querySelectorAll('.channel-item.active').forEach(el => el.classList.remove('active'));
     if (url) {
        const activeItem = channelListDiv.querySelector(`.channel-item[data-url="${url}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
     }
}