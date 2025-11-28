/* Version: #5 */

// === KONFIGURASJON & DATA ===

// Definisjon av nivåer. 
// Grid: x (kolonne), y (rad). 0,0 er øverst til venstre.
const levels = [
    {
        id: 1,
        name: "Nivå 1: Introduksjon",
        width: 4,
        height: 5,
        start: { x: 3, y: 4 }, 
        goal: { x: 3, y: 0 },
        cells: [
            // Rad 0
            [
                { type: 'none', walls: ['left', 'top', 'bottom'] },
                { type: 'red', walls: ['top'] },
                { type: 'blue', walls: ['top'] },
                { type: 'none', walls: ['top', 'right'] }
            ],
            // Rad 1
            [
                { type: 'blue', walls: ['left', 'top'] },
                { type: 'red', walls: [] },
                { type: 'blue', walls: ['right'] },
                { type: 'red', walls: ['left', 'right'] }
            ],
            // Rad 2
            [
                { type: 'red', walls: ['left'] },
                { type: 'blue', walls: ['bottom'] },
                { type: 'red', walls: ['top', 'right'] },
                { type: 'blue', walls: ['left', 'right'] }
            ],
            // Rad 3
            [
                { type: 'blue', walls: ['left'] },
                { type: 'red', walls: ['top', 'bottom'] },
                { type: 'blue', walls: ['bottom'] },
                { type: 'red', walls: ['left', 'right', 'bottom'] }
            ],
            // Rad 4
            [
                { type: 'red', walls: ['left', 'bottom'] },
                { type: 'blue', walls: ['top', 'bottom'] },
                { type: 'red', walls: ['top', 'bottom'] },
                { type: 'none', walls: ['bottom', 'right', 'top'] }
            ]
        ]
    }
];

// === TILSTANDSVARIABLER ===
let currentLevelIndex = 0;
let currentLevel = null;
let playerPos = { x: 0, y: 0 };
let currentColorContext = null; 

// === DOM ELEMENTER ===
const boardElement = document.getElementById('game-board');
const statusElement = document.getElementById('status-display');
const btnReset = document.getElementById('btn-reset');
const btnGenerate = document.getElementById('btn-generate');
const btnDownload = document.getElementById('btn-download');
const debugLog = document.getElementById('debug-log');

// === LOGGER ===
function log(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] ${msg}`;
    console.log(logLine);
    debugLog.textContent = logLine + "\n" + debugLog.textContent;
    if (debugLog.textContent.length > 2000) {
        debugLog.textContent = debugLog.textContent.substring(0, 2000) + "...";
    }
}

// === GENERATOR ===

function generateLevel(width, height) {
    log(`Genererer nytt nivå (${width}x${height})...`);
    
    // 1. Initialiser Grid med vegger overalt
    let cells = [];
    for (let y = 0; y < height; y++) {
        let row = [];
        for (let x = 0; x < width; x++) {
            row.push({
                x: x, 
                y: y,
                type: 'none', // Fylles senere
                walls: ['top', 'right', 'bottom', 'left'],
                visited: false // For maze generation
            });
        }
        cells.push(row);
    }

    // 2. Maze Generation (Recursive Backtracking)
    let stack = [];
    let current = cells[0][0];
    current.visited = true;
    stack.push(current);

    while (stack.length > 0) {
        current = stack.pop();
        
        let neighbors = [];
        const directions = [
            { dx: 0, dy: -1, wall: 'top', opp: 'bottom' },
            { dx: 1, dy: 0, wall: 'right', opp: 'left' },
            { dx: 0, dy: 1, wall: 'bottom', opp: 'top' },
            { dx: -1, dy: 0, wall: 'left', opp: 'right' }
        ];

        directions.forEach(dir => {
            const nx = current.x + dir.dx;
            const ny = current.y + dir.dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                if (!cells[ny][nx].visited) {
                    neighbors.push({ cell: cells[ny][nx], dir: dir });
                }
            }
        });

        if (neighbors.length > 0) {
            stack.push(current);
            const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
            const next = chosen.cell;
            const dir = chosen.dir;

            current.walls = current.walls.filter(w => w !== dir.wall);
            next.walls = next.walls.filter(w => w !== dir.opp);

            next.visited = true;
            stack.push(next);
        }
    }

    // 3. Fjern noen ekstra vegger for å lage løkker
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = cells[y][x];
            if (cell.walls.length > 0 && Math.random() < 0.1) {
                const wallToRemove = cell.walls[Math.floor(Math.random() * cell.walls.length)];
                let nx = x, ny = y, oppWall = '';
                if (wallToRemove === 'top') { ny--; oppWall = 'bottom'; }
                if (wallToRemove === 'bottom') { ny++; oppWall = 'top'; }
                if (wallToRemove === 'left') { nx--; oppWall = 'right'; }
                if (wallToRemove === 'right') { nx++; oppWall = 'left'; }

                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    cell.walls = cell.walls.filter(w => w !== wallToRemove);
                    cells[ny][nx].walls = cells[ny][nx].walls.filter(w => w !== oppWall);
                }
            }
        }
    }

    // 4. Definer Start og Mål
    const startPos = { x: 0, y: height - 1 };
    const goalPos = { x: width - 1, y: 0 };

    // 5. Finn korteste vei (BFS)
    let queue = [{ x: startPos.x, y: startPos.y, path: [] }];
    let visitedBFS = new Set();
    let solutionPath = null;

    visitedBFS.add(`${startPos.x},${startPos.y}`);

    while (queue.length > 0) {
        let curr = queue.shift();
        
        if (curr.x === goalPos.x && curr.y === goalPos.y) {
            solutionPath = curr.path;
            break;
        }

        const cell = cells[curr.y][curr.x];
        const directions = [
            { dx: 0, dy: -1, wall: 'top' },
            { dx: 1, dy: 0, wall: 'right' },
            { dx: 0, dy: 1, wall: 'bottom' },
            { dx: -1, dy: 0, wall: 'left' }
        ];

        directions.forEach(dir => {
            if (!cell.walls.includes(dir.wall)) {
                const nx = curr.x + dir.dx;
                const ny = curr.y + dir.dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    if (!visitedBFS.has(`${nx},${ny}`)) {
                        visitedBFS.add(`${nx},${ny}`);
                        let newPath = [...curr.path, { x: nx, y: ny }];
                        queue.push({ x: nx, y: ny, path: newPath });
                    }
                }
            }
        });
    }

    if (!solutionPath) {
        log("Retry: Ingen løsning funnet.");
        return generateLevel(width, height);
    }

    // 6. Fargelegg stien
    let colorToggle = true; 
    if (Math.random() > 0.5) colorToggle = false;

    solutionPath.forEach((pos) => {
        if (pos.x === goalPos.x && pos.y === goalPos.y) return;
        cells[pos.y][pos.x].type = colorToggle ? 'red' : 'blue';
        cells[pos.y][pos.x].isOnPath = true;
        colorToggle = !colorToggle;
    });

    // 7. Fyll resten
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if ((x === startPos.x && y === startPos.y) || (x === goalPos.x && y === goalPos.y)) continue;
            if (cells[y][x].isOnPath) continue;
            cells[y][x].type = Math.random() > 0.5 ? 'red' : 'blue';
        }
    }

    const cleanCells = cells.map(row => row.map(c => ({
        type: c.type,
        walls: c.walls
    })));

    return {
        id: Date.now(),
        name: `Generert Nivå (${width}x${height})`,
        width: width,
        height: height,
        start: startPos,
        goal: goalPos,
        cells: cleanCells
    };
}


// === SPILLMOTOR ===

function initGame() {
    log("Initialiserer spill...");
    
    btnGenerate.disabled = false;
    btnGenerate.textContent = "Generer Nytt Nivå";
    
    loadLevel(0);

    // Event Listeners
    btnReset.addEventListener('click', () => {
        log("Knapp: Nullstill Nivå");
        setupLevelData(currentLevel);
    });

    btnGenerate.addEventListener('click', () => {
        log("Knapp: Generer Nytt Nivå");
        const newLevel = generateLevel(5, 6); 
        currentLevelIndex = -1;
        levels.push(newLevel);
        setupLevelData(newLevel);
    });

    btnDownload.addEventListener('click', () => {
        log("Forbereder nedlasting av bilde...");
        
        // 1. Skjul spilleren midlertidig
        const player = document.querySelector('.player');
        if (player) player.style.display = 'none';

        // 2. Fjern grønne "valid move" markeringer
        const highlights = document.querySelectorAll('.valid-move');
        highlights.forEach(el => el.classList.remove('valid-move'));

        // 3. Ta bilde av #board-container
        html2canvas(document.querySelector("#board-container")).then(canvas => {
            // Last ned
            const link = document.createElement('a');
            link.download = `fargelabyrint_${Date.now()}.png`;
            link.href = canvas.toDataURL();
            link.click();
            
            // 4. Gjenopprett visning
            if (player) player.style.display = 'block';
            renderBoard(); // Tegn på nytt for å få tilbake highlights
            log("Bilde lastet ned.");
        });
    });

    document.addEventListener('keydown', (e) => {
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -1;
        if (e.key === 'ArrowDown') dy = 1;
        if (e.key === 'ArrowLeft') dx = -1;
        if (e.key === 'ArrowRight') dx = 1;

        if (dx !== 0 || dy !== 0) {
            e.preventDefault(); 
            tryMove(dx, dy);
        }
    });

    log("Spill klart. Start ved START.");
}

function setupLevelData(levelData) {
    currentLevel = levelData;
    playerPos = { ...currentLevel.start };
    currentColorContext = null; 

    log(`Laster ${currentLevel.name}. Startposisjon: ${playerPos.x}, ${playerPos.y}`);
    statusElement.textContent = "Bruk piltaster eller klikk for å flytte.";
    statusElement.style.color = "#555"; 

    renderBoard();
}

function loadLevel(index) {
    if (index >= levels.length) return;
    currentLevelIndex = index;
    setupLevelData(levels[index]);
}

function renderBoard() {
    boardElement.innerHTML = ''; 
    boardElement.style.gridTemplateColumns = `repeat(${currentLevel.width}, var(--cell-size))`;

    for (let y = 0; y < currentLevel.height; y++) {
        for (let x = 0; x < currentLevel.width; x++) {
            const cellData = currentLevel.cells[y][x];
            const cellDiv = document.createElement('div');
            cellDiv.classList.add('cell');
            
            if (cellData.walls) {
                cellData.walls.forEach(wall => cellDiv.classList.add(`wall-${wall}`));
            }

            if (x === currentLevel.start.x && y === currentLevel.start.y) {
                cellDiv.classList.add('cell-start');
            }
            if (x === currentLevel.goal.x && y === currentLevel.goal.y) {
                cellDiv.classList.add('cell-goal');
            }

            if (cellData.type === 'red' || cellData.type === 'blue') {
                const dot = document.createElement('div');
                dot.classList.add('dot', cellData.type);
                cellDiv.appendChild(dot);
            }

            if (x === playerPos.x && y === playerPos.y) {
                const player = document.createElement('div');
                player.classList.add('player');
                cellDiv.appendChild(player);
            }

            cellDiv.addEventListener('click', () => {
                const dx = x - playerPos.x;
                const dy = y - playerPos.y;
                if (Math.abs(dx) + Math.abs(dy) === 1) {
                    tryMove(dx, dy);
                }
            });
            
            if (isValidMove(x, y)) {
                cellDiv.classList.add('valid-move');
            }

            boardElement.appendChild(cellDiv);
        }
    }
}

function isValidMove(targetX, targetY) {
    if (targetX < 0 || targetX >= currentLevel.width || targetY < 0 || targetY >= currentLevel.height) {
        return false;
    }

    const currentCell = currentLevel.cells[playerPos.y][playerPos.x];
    const targetCell = currentLevel.cells[targetY][targetX];

    const dx = targetX - playerPos.x;
    const dy = targetY - playerPos.y;
    
    let direction = '';
    let oppositeDirection = '';

    if (dy === -1) { direction = 'top'; oppositeDirection = 'bottom'; }
    if (dy === 1)  { direction = 'bottom'; oppositeDirection = 'top'; }
    if (dx === -1) { direction = 'left'; oppositeDirection = 'right'; }
    if (dx === 1)  { direction = 'right'; oppositeDirection = 'left'; }

    if (currentCell.walls && currentCell.walls.includes(direction)) return false;
    if (targetCell.walls && targetCell.walls.includes(oppositeDirection)) return false;

    const fromColor = currentColorContext;
    const toColor = targetCell.type;

    if (toColor === 'none') return true;
    if (fromColor === null || fromColor === 'none') return true;

    if (fromColor === 'red' && toColor === 'blue') return true;
    if (fromColor === 'blue' && toColor === 'red') return true;

    return false;
}

function tryMove(dx, dy) {
    const newX = playerPos.x + dx;
    const newY = playerPos.y + dy;

    if (isValidMove(newX, newY)) {
        playerPos.x = newX;
        playerPos.y = newY;
        
        const cell = currentLevel.cells[newY][newX];
        currentColorContext = cell.type === 'none' ? null : cell.type;

        log(`Flyttet til (${newX},${newY}). Ny farge: ${currentColorContext || "Ingen"}`);
        
        if (newX === currentLevel.goal.x && newY === currentLevel.goal.y) {
            statusElement.textContent = "GRATULERER! DU KOM I MÅL!";
            statusElement.style.color = "green";
            log("SEIER! Mål nådd.");
        } else {
            statusElement.textContent = "Gjør ditt neste trekk...";
            statusElement.style.color = "#555";
        }

        renderBoard(); 
    } else {
        log("Ugyldig trekk!");
        statusElement.textContent = "Ugyldig trekk! Rød -> Blå -> Rød...";
        statusElement.style.color = "red";
        boardElement.classList.add('shake');
        setTimeout(() => boardElement.classList.remove('shake'), 300);
    }
}

initGame();
/* Version: #5 */
