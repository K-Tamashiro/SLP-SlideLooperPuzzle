/** Application bootstrap. Feature scripts are loaded in dependency order by index.html. */
document.addEventListener('DOMContentLoaded', () => {
    window.boardWrapper = document.getElementById('board-wrapper');
    bindInputEvents();
    initBoard();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js')
        .catch(err => console.error('SW failed', err));
}
