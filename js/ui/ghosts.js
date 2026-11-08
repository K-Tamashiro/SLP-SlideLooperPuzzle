/**
 * Visual substitutes for sliding tiles. Used by both drag and replay.
 * Coordinate origin and clipping: #board (NOT the padded #board-wrapper).
 * A strip contains three full lines; its centre copy starts at the original tiles.
 * Keep GAP_CELL within a face and GAP_FACE between faces and repeated lines.
 * See css/ghosts.css and docs/architecture.md before changing these dimensions.
 */
const GhostLayer = (() => {
    function createLines({ isVertical, indices, sourceOpacity, animated = false }) {
        const boardElement = document.getElementById('board');
        if (!boardElement) return [];

        const boardRect = boardElement.getBoundingClientRect();
        // Collect real cells once, before appending clones. Never include a previous strip.
        const originals = [...boardElement.querySelectorAll(':scope > .face > .cell')];
        const strips = [];
        const hiddenCells = [];

        try {
            for (const index of indices) {
                const cells = originals.filter(cell =>
                    Number(isVertical ? cell.dataset.col : cell.dataset.row) === index
                ).sort((a, b) => Number(isVertical ? a.dataset.row : a.dataset.col)
                    - Number(isVertical ? b.dataset.row : b.dataset.col));
                if (!cells.length) continue;

                const firstRect = cells[0].getBoundingClientRect();
                const strip = document.createElement('div');
                strip.className = animated ? 'ghost-strip analyze-ghost' : 'ghost-strip';
                strip.style.left = `${firstRect.left - boardRect.left}px`;
                strip.style.top = `${firstRect.top - boardRect.top}px`;
                strip.style.gap = `${GAP_FACE}px`;
                strip.style.flexDirection = isVertical ? 'column' : 'row';

                const createSet = () => {
                    const set = document.createElement('div');
                    set.style.display = isVertical ? 'grid' : 'flex';
                    set.style.gap = `${GAP_CELL}px`;
                    if (isVertical) set.style.gridTemplateColumns = '1fr';
                    cells.forEach((cell, i) => {
                        const clone = cell.cloneNode(true);
                        clone.style.opacity = '1';
                        // cloneNode does not copy canvas pixels. Freeze the rendered tile.
                        const canvas = cell.querySelector('canvas');
                        if (canvas) {
                            clone.querySelectorAll('canvas').forEach(c => c.remove());
                            clone.style.backgroundImage = `url(${canvas.toDataURL()})`;
                            clone.style.backgroundSize = 'cover';
                        }
                        if (i > 0 && i % subSize === 0) {
                            clone.style[isVertical ? 'marginTop' : 'marginLeft'] = `${GAP_FACE - GAP_CELL}px`;
                        }
                        set.appendChild(clone);
                    });
                    return set;
                };

                for (let copy = 0; copy < 3; copy++) strip.appendChild(createSet());
                if (isVertical) strip.style.top = `${firstRect.top - boardRect.top - boardRect.height - GAP_FACE}px`;
                else strip.style.left = `${firstRect.left - boardRect.left - boardRect.width - GAP_FACE}px`;

                boardElement.appendChild(strip);
                strips.push(strip);
                cells.forEach(cell => {
                    hiddenCells.push({ cell, opacity: cell.style.opacity });
                    cell.style.opacity = String(sourceOpacity);
                });
            }
            return strips;
        } catch (error) {
            remove(strips);
            hiddenCells.forEach(({ cell, opacity }) => { cell.style.opacity = opacity; });
            throw error;
        }
    }

    function remove(strips) {
        strips.forEach(strip => strip.remove());
    }

    function slideUnit() {
        return cellSizePixel * subSize + GAP_CELL * (subSize - 1) + GAP_FACE;
    }

    return { createLines, remove, slideUnit };
})();
