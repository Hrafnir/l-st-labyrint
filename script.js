/* Version: #12 */

document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTER ===
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const statusText = document.getElementById('status-text');
    const solverStatus = document.getElementById('solver-status');
    
    // Knapper
    const btnModePlay = document.getElementById('btn-mode-play');
    const btnModeEdit = document.getElementById('btn-mode-edit');
    const editTools = document.getElementById('edit-tools');
    const btnToolMove = document.getElementById('btn-tool-move');
    const btnToolNode = document.getElementById('btn-tool-node');
    const btnToolWall = document.getElementById('btn-tool-wall');
    const btnSolve = document.getElementById('btn-solve');
    const btnClear = document.getElementById('btn-clear');
    const btnDownload = document.getElementById('btn-download');

    // === KONFIGURASJON ===
    const COLORS = {
        red: '#e74c3c',
        blue: '#3498db',
        black: '#2c3e50', // Sperring
        player: '#27ae60',
        node: '#95a5a6',
        startNode: '#2ecc71',
        goalNode: '#e74c3c',
        highlight: 'rgba(46, 204, 113, 0.5)' // Løsningsvei
    };

    const NODE_RADIUS = 8;
    const WALL_WIDTH = 8;
    const CLICK_TOLERANCE = 15;

    // === TILSTAND (STATE) ===
    let appMode = 'play'; // 'play' eller 'edit'
    let editTool = 'move'; // 'move', 'node', 'wall'
    
    // Nivå data
    let rooms = []; // { id, x, y, isStart, isGoal }
    let walls = []; // { id, roomA, roomB, color }
    
    // Spilltilstand
    let currentRoomId = null;
    let lastWallColor = null; // 'red', 'blue', null
    let solutionPath = []; // For å vise løsning
    let showSolution = false;
    let isSolvable = false;

    // Editeringstilstand
    let draggingNode = null;
    let wallStartNode = null; // Når man drar en ny vegg

    // === INITIALISERING ===
    function init() {
        // Lag et standard brett
        createDefaultLevel();
        
        // Start opp
        setMode('play');
        checkSolvability();
        draw();
    }

    // === EVENT LISTENERS ===
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    
    // Touch support (enkel mapping)
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    }, {passive: false});

    // UI Knapper
    btnModePlay.addEventListener('click', () => setMode('play'));
    btnModeEdit.addEventListener('click', () => setMode('edit'));
    
    btnToolMove.addEventListener('click', () => setTool('move'));
    btnToolNode.addEventListener('click', () => setTool('node'));
    btnToolWall.addEventListener('click', () => setTool('wall'));

    btnSolve.addEventListener('click', () => {
        if (!isSolvable) return;
        showSolution = !showSolution;
        if (showSolution) {
            btnSolve.textContent = "Skjul Løsning";
            runSolver(true); // Kjør full solve for å få path
        } else {
            btnSolve.textContent = "Vis Løsning";
            solutionPath = [];
        }
        draw();
    });

    btnClear.addEventListener('click', () => {
        if(confirm("Er du sikker på at du vil tømme brettet?")) {
            rooms = [];
            walls = [];
            currentRoomId = null;
            lastWallColor = null;
            addRoom(100, 300, true); // Start
            addRoom(700, 300, false, true); // Mål
            checkSolvability();
            draw();
        }
    });

    btnDownload.addEventListener('click', downloadImage);

    // === FUNKSJONER FOR MODUS OG VERKTØY ===
    function setMode(mode) {
        appMode = mode;
        if (mode === 'play') {
            btnModePlay.classList.add('active');
            btnModeEdit.classList.remove('active');
            editTools.style.display = 'none';
            statusText.textContent = "Spillmodus: Klikk på vegger for å gå.";
            // Reset spill
            resetGame();
        } else {
            btnModeEdit.classList.add('active');
            btnModePlay.classList.remove('active');
            editTools.style.display = 'flex';
            statusText.textContent = "Redigering: Endre brettet.";
            showSolution = false;
            btnSolve.textContent = "Vis Løsning";
            // Sikre at vi har start/mål
            ensureStartAndGoal();
        }
        draw();
    }

    function setTool(tool) {
        editTool = tool;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        if (tool === 'move') btnToolMove.classList.add('active');
        if (tool === 'node') btnToolNode.classList.add('active');
        if (tool === 'wall') btnToolWall.classList.add('active');
    }

    // === LOGIKK: SPILL ===
    
    function resetGame() {
        const start = rooms.find(r => r.isStart);
        if (start) currentRoomId = start.id;
        else if (rooms.length > 0) currentRoomId = rooms[0].id;
        lastWallColor = null;
        checkSolvability();
    }

    function tryMoveThroughWall(wall) {
        // 1. Sjekk farge
        if (wall.color === 'black') {
            shakeCanvas();
            statusText.textContent = "Svarte vegger er sperret!";
            return;
        }

        if (lastWallColor !== null && wall.color === lastWallColor) {
            shakeCanvas();
            statusText.textContent = `Feil! Du må bytte farge (fra ${translateColor(lastWallColor)}).`;
            return;
        }

        // 2. Sjekk at veggen faktisk kobler til rommet vi er i
        let nextRoomId = null;
        if (wall.roomA === currentRoomId) nextRoomId = wall.roomB;
        else if (wall.roomB === currentRoomId) nextRoomId = wall.roomA;
        else {
            // Veggen er ikke koblet til der vi står
            statusText.textContent = "Du kan bare gå gjennom vegger i rommet du er i.";
            return;
        }

        // 3. Utfør trekk
        currentRoomId = nextRoomId;
        lastWallColor = wall.color;
        
        const r = rooms.find(r => r.id === currentRoomId);
        if (r && r.isGoal) {
            statusText.textContent = "MÅL NÅDD! Gratulerer!";
            statusText.style.color = "green";
        } else {
            const nextReq = (wall.color === 'red') ? 'BLÅ' : 'RØD';
            statusText.textContent = `Bra. Neste må være ${nextReq}.`;
            statusText.style.color = "#333";
        }

        // Oppdater løser-status i real-time
        checkSolvability(); 
        draw();
    }

    // === LOGIKK: REDIGERING ===

    function handleMouseDown(e) {
        const pos = getMousePos(e);

        if (appMode === 'play') {
            // I Play-mode klikker vi på vegger
            const clickedWall = getClosestWall(pos.x, pos.y);
            if (clickedWall && clickedWall.dist < CLICK_TOLERANCE) {
                tryMoveThroughWall(clickedWall.wall);
            }
            return;
        }

        // Edit Mode
        if (editTool === 'move') {
            const node = getClosestNode(pos.x, pos.y);
            if (node && node.dist < NODE_RADIUS * 2) {
                draggingNode = node.room;
            } else {
                // Sjekk om vi klikket på en vegg for å endre farge
                const wallObj = getClosestWall(pos.x, pos.y);
                if (wallObj && wallObj.dist < CLICK_TOLERANCE) {
                    cycleWallColor(wallObj.wall);
                }
            }
        } 
        else if (editTool === 'node') {
            addRoom(pos.x, pos.y);
        }
        else if (editTool === 'wall') {
            const node = getClosestNode(pos.x, pos.y);
            if (node && node.dist < NODE_RADIUS * 2) {
                wallStartNode = node.room;
            }
        }
        draw();
    }

    function handleMouseMove(e) {
        const pos = getMousePos(e);
        if (draggingNode) {
            draggingNode.x = pos.x;
            draggingNode.y = pos.y;
            draw();
        } else if (wallStartNode) {
            // Tegn midlertidig strek
            draw();
            ctx.beginPath();
            ctx.moveTo(wallStartNode.x, wallStartNode.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = '#999';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function handleMouseUp(e) {
        const pos = getMousePos(e);

        if (appMode === 'edit') {
            if (draggingNode) {
                draggingNode = null;
                checkSolvability();
            } 
            else if (wallStartNode) {
                const target = getClosestNode(pos.x, pos.y);
                if (target && target.dist < NODE_RADIUS * 2 && target.room.id !== wallStartNode.id) {
                    addWall(wallStartNode.id, target.room.id);
                }
                wallStartNode = null;
                checkSolvability();
            }
        }
        draw();
    }

    // === HJELPEFUNKSJONER DATA ===

    function addRoom(x, y, isStart = false, isGoal = false) {
        const id = Date.now() + Math.floor(Math.random()*1000);
        rooms.push({ id, x, y, isStart, isGoal });
        checkSolvability();
        draw();
    }

    function addWall(idA, idB) {
        // Sjekk om vegg finnes fra før
        const exists = walls.find(w => (w.roomA === idA && w.roomB === idB) || (w.roomA === idB && w.roomB === idA));
        if (exists) return;

        walls.push({
            id: Date.now(),
            roomA: idA,
            roomB: idB,
            color: 'red' // Default
        });
    }

    function cycleWallColor(wall) {
        if (wall.color === 'red') wall.color = 'blue';
        else if (wall.color === 'blue') wall.color = 'black';
        else if (wall.color === 'black') {
            // Slett vegg
            walls = walls.filter(w => w.id !== wall.id);
        }
        checkSolvability();
        draw();
    }

    function ensureStartAndGoal() {
        if (!rooms.some(r => r.isStart) && rooms.length > 0) rooms[0].isStart = true;
        if (!rooms.some(r => r.isGoal) && rooms.length > 1) rooms[rooms.length-1].isGoal = true;
    }

    function createDefaultLevel() {
        // Opprett en 3x3 grid for demo
        const grid = [];
        for(let y=0; y<3; y++) {
            for(let x=0; x<3; x++) {
                addRoom(200 + x*150, 150 + y*150);
            }
        }
        // Sett start og mål
        rooms[0].isStart = true;
        rooms[rooms.length-1].isGoal = true;
        currentRoomId = rooms[0].id;

        // Koble noen vegger
        const ids = rooms.map(r => r.id);
        addWall(ids[0], ids[1]); // R
        addWall(ids[1], ids[2]); // R -> B (change later)
        addWall(ids[0], ids[3]); // R
        addWall(ids[3], ids[4]); 
        addWall(ids[4], ids[5]);
        addWall(ids[4], ids[1]);
        addWall(ids[5], ids[8]);
        
        // Juster farger manuelt for demo
        walls[1].color = 'blue';
        walls[3].color = 'blue';
        walls[6].color = 'blue';
    }

    // === MATEMATIKK & GEOMETRI ===

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    function getClosestNode(x, y) {
        let closest = null;
        let minDst = Infinity;
        rooms.forEach(r => {
            const d = Math.hypot(r.x - x, r.y - y);
            if (d < minDst) {
                minDst = d;
                closest = r;
            }
        });
        return closest ? { room: closest, dist: minDst } : null;
    }

    function getClosestWall(x, y) {
        let closest = null;
        let minDst = Infinity;

        walls.forEach(w => {
            const rA = rooms.find(r => r.id === w.roomA);
            const rB = rooms.find(r => r.id === w.roomB);
            if (!rA || !rB) return;

            // Avstand fra punkt til linjestykke
            const dist = distToSegment({x,y}, rA, rB);
            if (dist < minDst) {
                minDst = dist;
                closest = w;
            }
        });
        return closest ? { wall: closest, dist: minDst } : null;
    }

    function distToSegment(p, v, w) {
        const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
        if (l2 == 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
        return Math.hypot(p.x - proj.x, p.y - proj.y);
    }

    // === LØSER (BFS) ===

    function runSolver(savePath = false) {
        // State: { currentRoomId, lastColor, path }
        // Vi må unngå uendelige løkker. En "tilstand" er (rom + farge ankommet med).
        // Å besøke rom A med Rød er annerledes enn rom A med Blå.

        const startRoom = rooms.find(r => r.isStart);
        if (!startRoom) return false;

        // Initial state: Start rom, ingen lastColor
        // MERK: Vi bruker lastColor fra nåværende spilltilstand hvis vi bare sjekker
        // for å se om man KAN løse det fra der man står.
        // Men "checkSolvability" bør sjekke fra START hvis vi er i edit, eller CURRENT hvis play.
        
        let startNodeId = (appMode === 'play') ? currentRoomId : startRoom.id;
        let startColor = (appMode === 'play') ? lastWallColor : null;

        let queue = [{ 
            r: startNodeId, 
            c: startColor, 
            path: [] 
        }];
        
        let visited = new Set();
        visited.add(`${startNodeId}-${startColor}`);

        while (queue.length > 0) {
            let curr = queue.shift();

            // Sjekk om mål
            const rObj = rooms.find(r => r.id === curr.r);
            if (rObj && rObj.isGoal) {
                if (savePath) {
                    solutionPath = curr.path;
                }
                return true;
            }

            // Finn naboer via vegger
            walls.forEach(w => {
                // Er veggen koblet til dette rommet?
                let neighborId = null;
                if (w.roomA === curr.r) neighborId = w.roomB;
                else if (w.roomB === curr.r) neighborId = w.roomA;

                if (neighborId !== null) {
                    // Er veggen passbar?
                    if (w.color === 'black') return;
                    
                    // Fargesjekk (Må være ulik forrige)
                    if (curr.c === null || w.color !== curr.c) {
                        const stateKey = `${neighborId}-${w.color}`;
                        if (!visited.has(stateKey)) {
                            visited.add(stateKey);
                            
                            // Legg til i kø
                            // Path lagrer ID til veggene vi går gjennom
                            let newPath = savePath ? [...curr.path, {
                                wallId: w.id,
                                x: (rooms.find(rm=>rm.id===w.roomA).x + rooms.find(rm=>rm.id===w.roomB).x)/2,
                                y: (rooms.find(rm=>rm.id===w.roomA).y + rooms.find(rm=>rm.id===w.roomB).y)/2
                            }] : [];

                            queue.push({
                                r: neighborId,
                                c: w.color,
                                path: newPath
                            });
                        }
                    }
                }
            });
        }
        return false;
    }

    function checkSolvability() {
        isSolvable = runSolver(false);
        if (isSolvable) {
            solverStatus.textContent = "Brettet er løsbart.";
            solverStatus.className = "status-ok";
            btnSolve.disabled = false;
        } else {
            solverStatus.textContent = "Ingen løsning funnet!";
            solverStatus.className = "status-error";
            btnSolve.disabled = true;
        }
    }

    // === TEGNING ===

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Vegger
        walls.forEach(w => {
            const rA = rooms.find(r => r.id === w.roomA);
            const rB = rooms.find(r => r.id === w.roomB);
            if (!rA || !rB) return;

            ctx.beginPath();
            ctx.moveTo(rA.x, rA.y);
            ctx.lineTo(rB.x, rB.y);
            ctx.lineWidth = WALL_WIDTH;
            ctx.lineCap = 'round';
            ctx.strokeStyle = COLORS[w.color];
            
            // Highlight hvis svart (sperret) litt annerledes?
            if (w.color === 'black') {
                ctx.setLineDash([5, 5]);
            } else {
                ctx.setLineDash([]);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        });

        // 2. Noder (Rom) - Vises tydelig i Edit, mindre i Play
        rooms.forEach(r => {
            // Tegn ikke selve "rommet" som en stor sirkel i play, bare i edit
            if (appMode === 'edit') {
                ctx.beginPath();
                ctx.arc(r.x, r.y, NODE_RADIUS, 0, 2*Math.PI);
                ctx.fillStyle = r.isStart ? COLORS.startNode : (r.isGoal ? COLORS.goalNode : COLORS.node);
                ctx.fill();
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Start/Mål tekst
                if (r.isStart) ctx.fillText("START", r.x - 15, r.y - 15);
                if (r.isGoal) ctx.fillText("MÅL", r.x - 10, r.y - 15);
            } else {
                // I Play mode, vis start og mål tekst
                ctx.fillStyle = "#000";
                ctx.font = "bold 14px Arial";
                if (r.isStart) ctx.fillText("INN", r.x - 10, r.y + 5);
                if (r.isGoal) ctx.fillText("UT", r.x - 10, r.y + 5);
            }
        });

        // 3. Spiller (I Play mode)
        if (appMode === 'play' && currentRoomId) {
            const r = rooms.find(r => r.id === currentRoomId);
            if (r) {
                ctx.beginPath();
                ctx.arc(r.x, r.y, 12, 0, 2*Math.PI);
                ctx.fillStyle = COLORS.player;
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#fff';
                ctx.stroke();
            }
        }

        // 4. Løsningsvei (Hvis aktivert)
        if (showSolution && solutionPath.length > 0) {
            ctx.beginPath();
            // Start fra der spilleren er
            const startR = rooms.find(r => r.id === currentRoomId);
            if (startR) ctx.moveTo(startR.x, startR.y);
            
            solutionPath.forEach(step => {
                ctx.lineTo(step.x, step.y);
                // Finn neste rom for linjen
                // (Forenklet visualisering: linje til midten av veggen, så videre)
            });
            
            ctx.strokeStyle = COLORS.highlight;
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
    }

    function translateColor(c) {
        return c === 'red' ? 'RØD' : 'BLÅ';
    }

    function shakeCanvas() {
        canvas.style.transform = "translateX(5px)";
        setTimeout(() => canvas.style.transform = "translateX(-5px)", 50);
        setTimeout(() => canvas.style.transform = "translateX(0)", 100);
    }

    function downloadImage() {
        // Tegn rent bilde for eksport
        const wasMode = appMode;
        appMode = 'play'; // Skjul edit noder
        draw();
        
        const link = document.createElement('a');
        link.download = `labyrint_${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();

        appMode = wasMode;
        draw();
    }

    // Start
    init();
});

/* Version: #12 */
