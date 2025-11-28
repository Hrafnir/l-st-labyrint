/* Version: #10 */

document.addEventListener('DOMContentLoaded', () => {
    // === KONFIGURASJON ===
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const statusElement = document.getElementById('status-display');
    const btnReset = document.getElementById('btn-reset');
    const btnGenerate = document.getElementById('btn-generate');
    const btnDownload = document.getElementById('btn-download');
    const debugLog = document.getElementById('debug-log');

    // Farger
    const COLOR_RED = '#e74c3c';
    const COLOR_BLUE = '#3498db';
    const COLOR_WALL_DEFAULT = '#ddd'; // For vegger som ikke er i bruk (hvis noen)
    const COLOR_PILLAR = '#222';
    const COLOR_PLAYER = '#27ae60';
    const COLOR_HIGHLIGHT = 'rgba(241, 196, 15, 0.4)'; // Gult lys i naborom

    // === DATASTRUKTUR ===
    // En level består nå av ROOMS (hvor spilleren er) og WALLS (forbindelser).
    
    // Hjelpefunksjon for å definere en vegg mellom to rom
    // Coordinates [x1, y1, x2, y2] er kun for tegning. Logic bruker roomA og roomB id.
    function createWall(roomA, roomB, color, coords) {
        return { roomA, roomB, color, coords };
    }

    const levels = [
        {
            id: 1,
            name: "Nivå 1: Håndtegnet Kopi",
            // Rommene defineres som sentrumspunkter (x,y)
            rooms: [
                { id: 0, x: 500, y: 600, label: "INN" }, // Start (Nede høyre)
                { id: 1, x: 300, y: 600 },               // Nede midt
                { id: 2, x: 100, y: 550 },               // Nede venstre (trekant)
                { id: 3, x: 500, y: 350 },               // Midt høyre
                { id: 4, x: 300, y: 350 },               // Senter
                { id: 5, x: 500, y: 100, label: "UT" },  // Oppe høyre (Mål)
                { id: 6, x: 300, y: 100 },               // Oppe midt
                { id: 7, x: 100, y: 250 }                // Venstre stor
            ],
            // Veggene definerer logikken (hvem er nabo med hvem) og visuelt utseende
            walls: [
                // Fra Room 0 (Start)
                createWall(0, 1, 'blue', [400, 650, 400, 500]), // Vertikal-ish skille? Nei, bilde 2 viser horisontale og vertikale vegger.
                // La oss visualisere veggene basert på bilde 2 sine svarte prikker.
                // Vegg mellom 0 og 1 (Blå)
                createWall(0, 1, 'blue', [400, 650, 400, 500]), 
                // Vegg mellom 0 og 3 (Rød) - Oppover
                createWall(0, 3, 'red', [400, 500, 600, 500]),

                // Bunnrekka videre
                createWall(1, 2, 'blue', [200, 650, 200, 500]), // Mellom midt og venstre
                createWall(1, 4, 'red', [200, 500, 400, 500]),  // Opp fra midt

                // Senteret
                createWall(3, 4, 'blue', [400, 500, 400, 200]), // Mellom H-Midt og Senter
                createWall(3, 5, 'red', [400, 200, 600, 200]),  // Opp til Mål

                // Venstre/Senter komplekset
                createWall(4, 7, 'blue', [200, 500, 200, 200]), // Senter til Venstre
                createWall(2, 7, 'blue', [50, 400, 200, 500]),  // Diagonal nede
                
                // Toppen
                createWall(5, 6, 'blue', [400, 200, 400, 50]),  // Mellom Mål og Topp-Midt
                createWall(4, 6, 'red', [200, 200, 400, 200]),  // Senter opp til Topp-Midt
                createWall(6, 7, 'red', [200, 200, 200, 50]),   // Venstre opp
            ],
            // Pillars (kun for pynt/hjørner)
            pillars: [
                {x: 400, y: 650}, {x: 400, y: 500}, {x: 600, y: 500},
                {x: 200, y: 650}, {x: 200, y: 500}, {x: 50, y: 400},
                {x: 400, y: 200}, {x: 600, y: 200}, {x: 200, y: 200},
                {x: 400, y: 50},  {x: 200, y: 50}
            ],
            startRoom: 0,
            goalRoom: 5
        }
    ];

    // === TILSTAND ===
    let currentLevel = null;
    let currentRoomId = 0;
    let lastWallColor = null; // 'red', 'blue' eller null

    // === LOGGING ===
    function log(msg) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${msg}`);
        if (debugLog) {
            debugLog.textContent = `[${timestamp}] ${msg}\n` + debugLog.textContent;
        }
    }

    // === GENERATOR (GRID BASED) ===
    function generateRandomLevel() {
        log("Genererer rom-basert labyrint...");
        
        // Grid konfigurasjon
        const cols = 4;
        const rows = 5;
        const padding = 50;
        const cellWidth = (canvas.width - padding*2) / cols;
        const cellHeight = (canvas.height - padding*2) / rows;

        let rooms = [];
        let walls = [];
        let pillars = [];

        // 1. Opprett Rom (Celler)
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                rooms.push({
                    id: r * cols + c,
                    x: padding + c * cellWidth + cellWidth/2,
                    y: padding + r * cellHeight + cellHeight/2,
                    gridX: c,
                    gridY: r
                });
            }
        }
        
        const startRoomId = rooms.length - 1; // Nede høyre
        const goalRoomId = 0; // Oppe venstre
        rooms[startRoomId].label = "INN";
        rooms[goalRoomId].label = "UT";

        // 2. Generer naboer og vegger
        // Vi lager først en liste over ALLE mulige vegger mellom naboer
        let allEdges = [];
        
        // Hjelpefunksjon for koordinater til vegg
        function getWallCoords(r1, r2) {
            // Hvis naboer horisontalt
            if (r1.gridY === r2.gridY) {
                const x = Math.max(r1.x, r2.x) - cellWidth/2;
                const topY = r1.y - cellHeight/2;
                const botY = r1.y + cellHeight/2;
                return [x, topY, x, botY];
            }
            // Hvis naboer vertikalt
            else {
                const y = Math.max(r1.y, r2.y) - cellHeight/2;
                const leftX = r1.x - cellWidth/2;
                const rightX = r1.x + cellWidth/2;
                return [leftX, y, rightX, y];
            }
        }

        rooms.forEach(room => {
            const neighbors = [];
            // Høyre nabo
            if (room.gridX < cols - 1) neighbors.push(rooms.find(r => r.gridX === room.gridX + 1 && r.gridY === room.gridY));
            // Nedre nabo
            if (room.gridY < rows - 1) neighbors.push(rooms.find(r => r.gridX === room.gridX && r.gridY === room.gridY + 1));
            
            neighbors.forEach(n => {
                allEdges.push({
                    u: room.id,
                    v: n.id,
                    coords: getWallCoords(room, n),
                    color: null // Bestemmes senere
                });
            });
        });

        // 3. Finn en sti (BFS) for å garantere løsning
        const adj = Array.from({length: rooms.length}, () => []);
        allEdges.forEach((e, index) => {
            adj[e.u].push({ to: e.v, edgeIndex: index });
            adj[e.v].push({ to: e.u, edgeIndex: index });
        });

        // BFS for å finne sti
        let queue = [{ curr: startRoomId, path: [] }]; // path inneholder edgeIndex
        let visited = new Set([startRoomId]);
        let solutionPathIndices = null;

        // Randomiser kø-utvalg for variasjon
        while(queue.length > 0) {
            // Grab random element for maze randomness look
            let idx = Math.floor(Math.random() * queue.length); 
            // Men BFS bør ideelt sett gå bredt. La oss bruke DFS-ish (stack) eller kø med random pick?
            // La oss bruke standard BFS men shuffle naboer.
            let item = queue.shift();
            
            if (item.curr === goalRoomId) {
                solutionPathIndices = item.path;
                break;
            }

            let neighbors = adj[item.curr];
            neighbors.sort(() => Math.random() - 0.5);

            for (let n of neighbors) {
                if (!visited.has(n.to)) {
                    visited.add(n.to);
                    queue.push({ curr: n.to, path: [...item.path, n.edgeIndex] });
                }
            }
        }

        if (!solutionPathIndices) {
            log("Feil: Fant ingen sti. Prøver på nytt.");
            return generateRandomLevel();
        }

        // 4. Fargelegg stien (R-B-R-B)
        // Vi starter med å bestemme at første vegg er, tja, Rød?
        let nextColor = Math.random() > 0.5 ? 'red' : 'blue';
        
        solutionPathIndices.forEach(idx => {
            allEdges[idx].color = nextColor;
            nextColor = (nextColor === 'red') ? 'blue' : 'red';
        });

        // 5. Fargelegg resten tilfeldig
        allEdges.forEach(e => {
            if (!e.color) {
                e.color = Math.random() > 0.5 ? 'red' : 'blue';
            }
            // Konverter til formatet motoren bruker
            walls.push(createWall(e.u, e.v, e.color, e.coords));
        });

        // Generer pillars for grid corners (visuelt)
        for(let r=0; r<=rows; r++) {
            for(let c=0; c<=cols; c++) {
                pillars.push({
                    x: padding + c*cellWidth,
                    y: padding + r*cellHeight
                });
            }
        }

        return {
            id: Date.now(),
            name: `Generert ${cols}x${rows}`,
            rooms: rooms,
            walls: walls,
            pillars: pillars,
            startRoom: startRoomId,
            goalRoom: goalRoomId
        };
    }


    // === MOTOR ===

    function initGame() {
        log("Starter Linje-Labyrinten (Rom-modus)...");
        
        btnGenerate.disabled = false;
        btnGenerate.textContent = "Generer Ny Bane";

        loadLevel(0);

        // Input håndtering
        canvas.addEventListener('mousedown', handleInput);
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); 
            handleInput(e.touches[0]);
        }, {passive: false});

        btnReset.addEventListener('click', () => {
             // Reset logikk
             currentRoomId = currentLevel.startRoom;
             lastWallColor = null;
             statusElement.textContent = `Nullstilt.`;
             statusElement.style.color = "#555";
             draw();
        });

        btnGenerate.addEventListener('click', () => {
            const newLevel = generateRandomLevel();
            levels.push(newLevel);
            loadLevel(levels.length - 1);
        });

        btnDownload.addEventListener('click', downloadImage);
    }

    function loadLevel(index) {
        currentLevel = levels[index];
        currentRoomId = currentLevel.startRoom;
        lastWallColor = null;
        
        statusElement.textContent = `Gå gjennom en vegg for å starte.`;
        statusElement.style.color = "#555";
        
        draw();
        log(`Lastet nivå: ${currentLevel.name}`);
    }

    function handleInput(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Finn hvilket rom bruker klikket i
        let clickedRoomId = -1;
        let minDesc = 9999;
        
        // Enkel sjekk: Nærmeste rom-senter
        currentLevel.rooms.forEach(room => {
            const dist = Math.sqrt(Math.pow(x - room.x, 2) + Math.pow(y - room.y, 2));
            // Vi kan anta at hvis dist < 50 (ca halv cell size) så mente man det rommet
            if (dist < 60) {
                clickedRoomId = room.id;
            }
        });

        if (clickedRoomId !== -1 && clickedRoomId !== currentRoomId) {
            tryMoveTo(clickedRoomId);
        }
    }

    function tryMoveTo(targetRoomId) {
        // 1. Sjekk om rommene henger sammen med en vegg
        const wall = currentLevel.walls.find(w => 
            (w.roomA === currentRoomId && w.roomB === targetRoomId) ||
            (w.roomA === targetRoomId && w.roomB === currentRoomId)
        );

        if (!wall) {
            log("Ingen vegg mellom disse rommene.");
            return; // Ikke naboer
        }

        // 2. Sjekk fargeregel
        // Regel: Ny farge må være motsatt av forrige.
        // Unntak: Start (lastWallColor er null)
        
        if (lastWallColor !== null && wall.color === lastWallColor) {
            log(`STOPP! Du gikk gjennom ${translateColor(lastWallColor)} sist. Må velge motsatt.`);
            statusElement.textContent = `Feil! Du må bytte farge (fra ${translateColor(lastWallColor)}).`;
            statusElement.style.color = "red";
            
            // Rist
            canvas.style.transform = "translateX(5px)";
            setTimeout(() => canvas.style.transform = "translateX(0)", 100);
            return;
        }

        // 3. Utfør flytt
        currentRoomId = targetRoomId;
        lastWallColor = wall.color;
        
        const nextColorReq = (wall.color === 'red') ? 'BLÅ' : 'RØD';
        statusElement.textContent = `Bra! Neste vegg må være ${nextColorReq}.`;
        statusElement.style.color = "#555";

        if (currentRoomId === currentLevel.goalRoom) {
            statusElement.textContent = "GRATULERER! DU KOM UT!";
            statusElement.style.color = "green";
            log("Mål nådd!");
        }

        draw();
    }

    function translateColor(c) {
        return c === 'red' ? 'RØD' : 'BLÅ';
    }

    // === TEGNING ===
    function draw() {
        // Tøm
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 1. Tegn vegger
        currentLevel.walls.forEach(wall => {
            ctx.beginPath();
            ctx.moveTo(wall.coords[0], wall.coords[1]);
            ctx.lineTo(wall.coords[2], wall.coords[3]);
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.strokeStyle = (wall.color === 'red') ? COLOR_RED : COLOR_BLUE;
            ctx.stroke();
        });

        // 2. Tegn pillars (svarte prikker i hjørnene for estetikk)
        if (currentLevel.pillars) {
            currentLevel.pillars.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 8, 0, 2*Math.PI);
                ctx.fillStyle = COLOR_PILLAR;
                ctx.fill();
            });
        }

        // 3. Highlight mulige rom (naboer med gyldig farge)
        // Finn naboer
        currentLevel.walls.forEach(w => {
            let neighborId = -1;
            if (w.roomA === currentRoomId) neighborId = w.roomB;
            if (w.roomB === currentRoomId) neighborId = w.roomA;

            if (neighborId !== -1) {
                // Sjekk om lovlig
                if (lastWallColor === null || w.color !== lastWallColor) {
                    const r = currentLevel.rooms.find(rm => rm.id === neighborId);
                    if (r) {
                        ctx.beginPath();
                        ctx.arc(r.x, r.y, 30, 0, 2*Math.PI);
                        ctx.fillStyle = COLOR_HIGHLIGHT;
                        ctx.fill();
                    }
                }
            }
        });

        // 4. Tegn rom-labels (INN/UT)
        currentLevel.rooms.forEach(r => {
            if (r.label) {
                ctx.font = "bold 20px Arial";
                ctx.fillStyle = "#000";
                ctx.fillText(r.label, r.x - 20, r.y + 10);
            }
        });

        // 5. Tegn Spilleren
        // Spilleren tegnes i sentrum av currentRoomId
        const playerRoom = currentLevel.rooms.find(r => r.id === currentRoomId);
        if (playerRoom) {
            ctx.beginPath();
            ctx.arc(playerRoom.x, playerRoom.y, 20, 0, 2*Math.PI);
            ctx.fillStyle = COLOR_PLAYER;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
        }
    }

    // === EKSPORT ===
    function downloadImage() {
        // Tegn uten spiller for bilde
        const savedRoom = currentRoomId;
        currentRoomId = -1; // Skjul
        draw();

        const link = document.createElement('a');
        link.download = `rom_labyrint_${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();

        // Sett tilbake
        currentRoomId = savedRoom;
        draw();
    }

    // Start
    initGame();
});

/* Version: #10 */
