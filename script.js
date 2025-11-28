/* Version: #3 */

// === KONFIGURASJON & DATA ===

// Definisjon av nivåer. 
// Grid: x (kolonne), y (rad). 0,0 er øverst til venstre.
const levels = [
    {
        id: 1,
        name: "Nivå 1: Introduksjon",
        width: 4,
        height: 5,
        start: { x: 3, y: 4 }, // Start nede til høyre
        goal: { x: 3, y: 0 },  // Mål oppe til høyre
        // Cells defineres rad for rad (y=0 til y=4).
        // Type: 'red', 'blue', 'none'
        // Walls: array med 'top', 'right', 'bottom', 'left'
        cells: [
            // Rad 0 (Topp)
            [
                { type: 'none', walls: ['left', 'top', 'bottom'] },     // 0,0 (Blindvei/tom)
                { type: 'red', walls: ['top'] },                        // 1,0
                { type: 'blue', walls: ['top'] },                       // 2,0
                { type: 'none', walls: ['top', 'right'] }               // 3,0 (MÅL - fargeløs for å kunne gå inn fra rød/blå?) - Justering: Mål er ofte nøytralt.
            ],
            // Rad 1
            [
                { type: 'blue', walls: ['left', 'top'] },               // 0,1
                { type: 'red', walls: [] },                             // 1,1
                { type: 'blue', walls: ['right'] },                     // 2,1 (Vegg mot høyre)
                { type: 'red', walls: ['left', 'right'] }               // 3,1 (Korridor)
            ],
            // Rad 2
            [
                { type: 'red', walls: ['left'] },                       // 0,2
                { type: 'blue', walls: ['bottom'] },                    // 1,2
                { type: 'red', walls: ['top', 'right'] },               // 2,2
                { type: 'blue', walls: ['left', 'right'] }              // 3,2
            ],
            // Rad 3
            [
                { type: 'blue', walls: ['left'] },                      // 0,3
                { type: 'red', walls: ['top', 'bottom'] },              // 1,3
                { type: 'blue', walls: ['bottom'] },                    // 2,3
                { type: 'red', walls: ['left', 'right', 'bottom'] }     // 3,3 (Lukket bunn)
            ],
            // Rad 4 (Bunn)
            [
                { type: 'red', walls: ['left', 'bottom'] },             // 0,4
                { type: 'blue', walls: ['top', 'bottom'] },             // 1,4
                { type: 'red', walls: ['top', 'bottom'] },              // 2,4
                { type: 'none', walls: ['bottom', 'right', 'top'] }     // 3,4 (START)
            ]
        ]
    }
];

// === TILSTANDSVARIABLER ===
let currentLevelIndex = 0;
let currentLevel = null;
let playerPos = { x: 0, y: 0 };
let currentColorContext = null; // Fargen på ruten vi STÅR på. null ved start.

// === DOM ELEMENTER ===
const boardElement = document.getElementById('game-board');
const statusElement = document.getElementById('status-display');
const btnReset = document.getElementById('btn-reset');
const debugLog = document.getElementById('debug-log');

// === LOGGER ===
function log(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] ${msg}`;
    console.log(logLine);
    debugLog.textContent = logLine + "\n" + debugLog.textContent;
    // Hold loggen passe kort visuelt
    if (debugLog.textContent.length > 2000) {
        debugLog.textContent = debugLog.textContent.substring(0, 2000) + "...";
    }
}

// === SPILLMOTOR ===

function initGame() {
    log("Initialiserer spill...");
    loadLevel(0);

    // Event Listeners
    btnReset.addEventListener('click', () => {
        log("Knapp: Nullstill Nivå");
        loadLevel(currentLevelIndex);
    });

    // Tastaturstyring
    document.addEventListener('keydown', (e) => {
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -1;
        if (e.key === 'ArrowDown') dy = 1;
        if (e.key === 'ArrowLeft') dx = -1;
        if (e.key === 'ArrowRight') dx = 1;

        if (dx !== 0 || dy !== 0) {
            e.preventDefault(); // Hindre scrolling
            tryMove(dx, dy);
        }
    });

    log("Spill klart. Start ved START.");
}

function loadLevel(index) {
    if (index >= levels.length) {
        log("Feil: Nivåindeks finnes ikke.");
        return;
    }

    currentLevel = levels[index];
    currentLevelIndex = index;
    
    // Sett spiller til start
    playerPos = { ...currentLevel.start };
    currentColorContext = null; // Ingen farge ved start (eller nøytral)

    log(`Laster ${currentLevel.name}. Startposisjon: ${playerPos.x}, ${playerPos.y}`);
    statusElement.textContent = "Bruk piltaster eller klikk for å flytte.";

    renderBoard();
}

function renderBoard() {
    boardElement.innerHTML = ''; // Tøm brett
    
    // Sett grid-størrelse i CSS
    boardElement.style.gridTemplateColumns = `repeat(${currentLevel.width}, var(--cell-size))`;

    // Generer celler
    for (let y = 0; y < currentLevel.height; y++) {
        for (let x = 0; x < currentLevel.width; x++) {
            const cellData = currentLevel.cells[y][x];
            const cellDiv = document.createElement('div');
            cellDiv.classList.add('cell');
            
            // Legg til vegger
            if (cellData.walls) {
                cellData.walls.forEach(wall => cellDiv.classList.add(`wall-${wall}`));
            }

            // Legg til Start/Mål tekst
            if (x === currentLevel.start.x && y === currentLevel.start.y) {
                cellDiv.classList.add('cell-start');
            }
            if (x === currentLevel.goal.x && y === currentLevel.goal.y) {
                cellDiv.classList.add('cell-goal');
            }

            // Legg til farge-dot
            if (cellData.type === 'red' || cellData.type === 'blue') {
                const dot = document.createElement('div');
                dot.classList.add('dot', cellData.type);
                cellDiv.appendChild(dot);
            }

            // Sjekk om spiller er her
            if (x === playerPos.x && y === playerPos.y) {
                const player = document.createElement('div');
                player.classList.add('player');
                cellDiv.appendChild(player);
            }

            // Legg til klikk-event for bevegelse (pathfinding eller kun naboer)
            // For enkelhets skyld: Klikk på nabo = flytt
            cellDiv.addEventListener('click', () => {
                const dx = x - playerPos.x;
                const dy = y - playerPos.y;
                // Sjekk om det er et nabotrekk (ikke diagonalt)
                if (Math.abs(dx) + Math.abs(dy) === 1) {
                    tryMove(dx, dy);
                }
            });
            
            // Debug hjelp: Marker gyldige trekk visuelt
            if (isValidMove(x, y)) {
                cellDiv.classList.add('valid-move');
            }

            boardElement.appendChild(cellDiv);
        }
    }
}

// Sjekker om spilleren KAN gå til en spesifikk koordinat
function isValidMove(targetX, targetY) {
    // 1. Innenfor brettet?
    if (targetX < 0 || targetX >= currentLevel.width || targetY < 0 || targetY >= currentLevel.height) {
        return false;
    }

    const currentCell = currentLevel.cells[playerPos.y][playerPos.x];
    const targetCell = currentLevel.cells[targetY][targetX];

    // 2. Vegger?
    // Beregn retning
    const dx = targetX - playerPos.x;
    const dy = targetY - playerPos.y;
    
    let direction = '';
    let oppositeDirection = '';

    if (dy === -1) { direction = 'top'; oppositeDirection = 'bottom'; }
    if (dy === 1)  { direction = 'bottom'; oppositeDirection = 'top'; }
    if (dx === -1) { direction = 'left'; oppositeDirection = 'right'; }
    if (dx === 1)  { direction = 'right'; oppositeDirection = 'left'; }

    // Sjekk vegg i nåværende celle
    if (currentCell.walls && currentCell.walls.includes(direction)) return false;
    // Sjekk vegg i målcelle
    if (targetCell.walls && targetCell.walls.includes(oppositeDirection)) return false;

    // 3. Fargeregler
    // Regel: Må gå til motsatt farge.
    // Hvis vi står på Start (ingen farge), kan vi gå til Rød eller Blå.
    // Hvis vi går til Mål (ofte ingen farge), er det lov.
    
    // Fargen vi kommer FRA:
    const fromColor = currentColorContext;
    // Fargen vi går TIL:
    const toColor = targetCell.type;

    // Hvis vi går til 'none' (typisk mål eller start), er det lov (med mindre det er en felle, men her antar vi Mål er safe)
    if (toColor === 'none') return true;

    // Hvis vi kommer fra 'none' (Start), er alt lov.
    if (fromColor === null || fromColor === 'none') return true;

    // Kjerne-logikk:
    if (fromColor === 'red' && toColor === 'blue') return true;
    if (fromColor === 'blue' && toColor === 'red') return true;

    // Hvis ingen av overnevnte, er det ulovlig (f.eks. Rød -> Rød)
    return false;
}

function tryMove(dx, dy) {
    const newX = playerPos.x + dx;
    const newY = playerPos.y + dy;

    log(`Prøver å flytte fra (${playerPos.x},${playerPos.y}) til (${newX},${newY})...`);

    if (isValidMove(newX, newY)) {
        // Utfør flytt
        playerPos.x = newX;
        playerPos.y = newY;
        
        // Oppdater farge-kontekst
        const cell = currentLevel.cells[newY][newX];
        
        // Hvis cellen har en farge, oppdaterer vi konteksten.
        // Hvis cellen er 'none' (f.eks. Mål), beholder vi kanskje forrige? 
        // Nei, 'none' betyr at vi ikke står på en farge.
        currentColorContext = cell.type === 'none' ? null : cell.type;

        log(`Flyttet til (${newX},${newY}). Ny farge: ${currentColorContext || "Ingen"}`);
        
        // Sjekk seier
        if (newX === currentLevel.goal.x && newY === currentLevel.goal.y) {
            statusElement.textContent = "GRATULERER! DU KOM I MÅL!";
            statusElement.style.color = "green";
            log("SEIER! Mål nådd.");
        } else {
            statusElement.textContent = "Gjør ditt neste trekk...";
            statusElement.style.color = "#555";
        }

        renderBoard(); // Tegn på nytt for å oppdatere spillerposisjon
    } else {
        log("Ugyldig trekk! Sjekk vegger eller fargerekkefølge.");
        statusElement.textContent = "Ugyldig trekk! Husk: Rød -> Blå -> Rød...";
        statusElement.style.color = "red";
        
        // Rist på brettet (visuell feedback - enkel CSS class toggle)
        boardElement.classList.add('shake');
        setTimeout(() => boardElement.classList.remove('shake'), 300);
    }
}

// Start spillet
initGame();

/* Version: #3 */
