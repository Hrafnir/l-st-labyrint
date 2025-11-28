/* Version: #19 */

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const statusText = document.getElementById('status-text');
    const roomCountText = document.getElementById('room-count');

    // UI Elements
    const btnModePlay = document.getElementById('btn-mode-play');
    const btnModeEdit = document.getElementById('btn-mode-edit');
    const editTools = document.getElementById('edit-tools');
    const btnToolPoint = document.getElementById('btn-tool-point');
    const btnToolWall = document.getElementById('btn-tool-wall');
    const btnToolSelect = document.getElementById('btn-tool-select');
    const btnSetStart = document.getElementById('btn-set-start');
    const btnSetGoal = document.getElementById('btn-set-goal');
    const btnSolve = document.getElementById('btn-solve');
    const btnClear = document.getElementById('btn-clear');
    const btnDownload = document.getElementById('btn-download');

    // Constants
    const COLORS = {
        red: '#e74c3c',
        blue: '#3498db',
        black: '#2c3e50',
        player: '#27ae60',
        point: '#555',
        pointSelected: '#e67e22',
        outside: '#f9f9f9',
        inside: '#eef',
        highlight: 'rgba(52, 152, 219, 0.2)',
        selected: 'rgba(241, 196, 15, 0.4)',
        solutionPath: 'rgba(46, 204, 113, 0.6)'
    };
    const POINT_RADIUS = 6;
    const CLICK_TOLERANCE = 12;

    // Data Model
    let points = []; 
    let walls = [];  
    let rooms = [];  
    
    // State
    let mode = 'play'; 
    let tool = 'select'; 
    
    // Interaction State
    let draggingPoint = null;
    let wallStartPoint = null; 
    let selectedRoomId = null;
    let hoverWall = null;
    let mousePos = {x:0, y:0};
    
    // Game State
    let currentRoomId = null;
    let lastWallColor = null;
    let solutionPath = []; // Array of wall IDs to highlight
    let showSolution = false;

    // === INITIALIZATION ===
    function init() {
        createDefaultLevel();
        recalculateRooms();
        setMode('play');
        draw();
    }

    // === EVENT LISTENERS ===
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    
    btnModePlay.addEventListener('click', () => setMode('play'));
    btnModeEdit.addEventListener('click', () => setMode('edit'));
    
    btnToolPoint.addEventListener('click', () => setTool('point'));
    btnToolWall.addEventListener('click', () => setTool('wall'));
    btnToolSelect.addEventListener('click', () => setTool('select'));
    
    btnSetStart.addEventListener('click', () => setRoomType('start'));
    btnSetGoal.addEventListener('click', () => setRoomType('goal'));

    btnSolve.addEventListener('click', solveLevel);
    
    btnClear.addEventListener('click', () => {
        if(confirm("Slett alt?")) {
            points = [];
            walls = [];
            rooms = [];
            currentRoomId = null;
            solutionPath = [];
            recalculateRooms();
            draw();
        }
    });

    btnDownload.addEventListener('click', downloadImage);

    // === MODES & TOOLS ===
    function setMode(newMode) {
        mode = newMode;
        wallStartPoint = null;
        draggingPoint = null;
        showSolution = false;

        if (mode === 'play') {
            btnModePlay.classList.add('active');
            btnModeEdit.classList.remove('active');
            editTools.style.display = 'none';
            statusText.textContent = "Spillmodus: Klikk på en vegg for å gå.";
            selectedRoomId = null;
            
            // Init Game
            resetGame();

        } else {
            btnModeEdit.classList.add('active');
            btnModePlay.classList.remove('active');
            editTools.style.display = 'flex';
            statusText.textContent = "Redigering: Velg verktøy.";
            setTool('wall');
        }
        draw();
    }

    function setTool(newTool) {
        tool = newTool;
        wallStartPoint = null;
        draggingPoint = null;
        
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        if (tool === 'point') {
            btnToolPoint.classList.add('active');
            statusText.textContent = "Punkt: Klikk for å sette punkter.";
        }
        if (tool === 'wall') {
            btnToolWall.classList.add('active');
            statusText.textContent = "Vegg: Klikk A, så Klikk B. (Slippes etterpå)";
        }
        if (tool === 'select') {
            btnToolSelect.classList.add('active');
            statusText.textContent = "Velg: Endre vegg (klikk), flytt punkt (dra), velg rom.";
        }
        draw();
    }

    function resetGame() {
        const startRoom = rooms.find(r => r.isStart);
        if (startRoom) currentRoomId = startRoom.id;
        else if (rooms.length > 0) currentRoomId = rooms.find(r => r.isOutside)?.id || rooms[0].id;
        lastWallColor = null;
        solutionPath = [];
    }

    // === CORE LOGIC: ROOM FINDER ===
    function recalculateRooms() {
        // Ta vare på start/mål
        const oldStart = rooms.find(r => r.isStart);
        const oldGoal = rooms.find(r => r.isGoal);
        const oldStartCenter = oldStart ? oldStart.centroid : null;
        const oldGoalCenter = oldGoal ? oldGoal.centroid : null;

        rooms = [];
        
        // 1. Bygg adjacency list
        const adj = {};
        // Initialiser for ALLE punkter (viktig bugfix)
        points.forEach(p => adj[p.id] = []);

        walls.forEach(w => {
            const p1 = points.find(p => p.id === w.p1);
            const p2 = points.find(p => p.id === w.p2);
            if (p1 && p2) {
                adj[w.p1].push({ 
                    neighborId: w.p2, 
                    wallId: w.id, 
                    angle: Math.atan2(p2.y - p1.y, p2.x - p1.x) 
                });
                adj[w.p2].push({ 
                    neighborId: w.p1, 
                    wallId: w.id, 
                    angle: Math.atan2(p1.y - p2.y, p1.x - p2.x) 
                });
            }
        });

        // Sorter naboer etter vinkel
        for (let pid in adj) {
            adj[pid].sort((a, b) => a.angle - b.angle);
        }

        // 2. Traverser grafen (Faces)
        const visitedEdges = new Set(); 

        for (let pStr in adj) {
            const startNode = parseInt(pStr);
            const neighbors = adj[startNode];
            
            if (!neighbors) continue; // Skip if no neighbors

            for (let i = 0; i < neighbors.length; i++) {
                const edgeKey = `${startNode}-${neighbors[i].neighborId}`;
                
                if (!visitedEdges.has(edgeKey)) {
                    const path = [];
                    let curr = startNode;
                    let nextInfo = neighbors[i];
                    
                    // Safety break
                    let iterations = 0;
                    const maxIterations = points.length * 2;

                    while (!visitedEdges.has(`${curr}-${nextInfo.neighborId}`) && iterations < maxIterations) {
                        visitedEdges.add(`${curr}-${nextInfo.neighborId}`);
                        path.push(curr);
                        
                        const prevNode = curr;
                        curr = nextInfo.neighborId;
                        iterations++;
                        
                        const currNeighbors = adj[curr];
                        if (!currNeighbors || currNeighbors.length === 0) break; // Dead end check

                        const backIndex = currNeighbors.findIndex(n => n.neighborId === prevNode);
                        if (backIndex === -1) break;

                        // Next Edge CCW
                        let nextIndex = (backIndex - 1 + currNeighbors.length) % currNeighbors.length;
                        nextInfo = currNeighbors[nextIndex];
                    }
                    
                    if (path.length >= 3) {
                        const roomPoints = path.map(pid => points.find(p => p.id === pid));
                        const area = calculateSignedArea(roomPoints);
                        const centroid = calculateCentroid(roomPoints);
                        
                        rooms.push({
                            id: Date.now() + Math.random(),
                            pointIds: path,
                            area: area,
                            centroid: centroid,
                            isOutside: false,
                            isStart: false,
                            isGoal: false
                        });
                    }
                }
            }
        }

        // 3. Identifiser Utsiden
        if (rooms.length > 0) {
            rooms.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
            rooms[0].isOutside = true; 
            rooms[0].id = 'outside';
        }

        // Gjenopprett Start/Mål
        if (oldStartCenter) {
            const r = getRoomAt(oldStartCenter.x, oldStartCenter.y);
            if (r) r.isStart = true;
        }
        if (oldGoalCenter) {
            const r = getRoomAt(oldGoalCenter.x, oldGoalCenter.y);
            if (r) r.isGoal = true;
        }

        roomCountText.textContent = `${rooms.length} Rom`;
    }

    // === SOLVER ALGORITHM ===
    function solveLevel() {
        // Finn start og mål
        const startRoom = rooms.find(r => r.isStart);
        const goalRoom = rooms.find(r => r.isGoal);

        if (!startRoom || !goalRoom) {
            alert("Du må sette både START og MÅL først!");
            return;
        }

        statusText.textContent = "Analyserer...";
        
        // BFS State: { roomId, lastColor, path: [wallId, wallId...] }
        // Vi må inkludere lastColor i visited-state fordi det påvirker hvor vi kan gå.
        
        let queue = [{
            rId: startRoom.id,
            color: null, // Ingen farge ved start
            path: []
        }];

        let visited = new Set(); // Format: "roomId-color"
        visited.add(`${startRoom.id}-null`);

        let foundPath = null;

        while (queue.length > 0) {
            let curr = queue.shift();

            if (curr.rId === goalRoom.id) {
                foundPath = curr.path;
                break;
            }

            // Finn naboer (vegger i dette rommet)
            // Vi må finne alle vegger som grenser til curr.rId
            // En vegg grenser hvis den deler to rom, og ett av dem er curr.rId
            
            // Dette er litt ineffektivt (looper alle vegger), men ok for små brett.
            // Optimalisering: Pre-kalkuler naboer i recalculateRooms.
            
            const adjacentWalls = walls.filter(w => {
                // Sjekk om veggen tilhører rommet.
                // Vi bruker samme logikk som i handlePlayClick
                const r1 = getRoomByPoints(w.p1, w.p2, curr.rId); // Sjekk om currRoom har disse punktene
                // Dette er vanskeligere fordi en vegg er delt av to rom.
                // La oss finne de to rommene veggen deler.
                const sharedRooms = getRoomsSharingWall(w);
                return sharedRooms.some(r => r.id === curr.rId);
            });

            for (let w of adjacentWalls) {
                // Sjekk regler
                if (w.color === 'black') continue;
                if (curr.color !== null && w.color === curr.color) continue;

                // Finn det ANDRE rommet
                const sharedRooms = getRoomsSharingWall(w);
                const nextRoom = sharedRooms.find(r => r.id !== curr.rId);

                if (nextRoom) {
                    const stateKey = `${nextRoom.id}-${w.color}`;
                    if (!visited.has(stateKey)) {
                        visited.add(stateKey);
                        queue.push({
                            rId: nextRoom.id,
                            color: w.color,
                            path: [...curr.path, w.id]
                        });
                    }
                }
            }
        }

        if (foundPath) {
            solutionPath = foundPath;
            showSolution = true;
            statusText.textContent = `Løsning funnet! (${foundPath.length} steg)`;
            statusText.style.color = "green";
            draw();
        } else {
            solutionPath = [];
            showSolution = false;
            statusText.textContent = "Ingen løsning funnet.";
            statusText.style.color = "red";
            alert("Ingen løsning funnet! Sjekk at vegger har riktig farge og at det er en åpning.");
            draw();
        }
    }

    function getRoomsSharingWall(wall) {
        return rooms.filter(r => {
            // Et rom deler en vegg hvis rommet inneholder begge punktene til veggen
            // (Foreklet logikk som fungerer for polygoner definert av punkter)
            return r.pointIds.includes(wall.p1) && r.pointIds.includes(wall.p2);
        });
    }

    function getRoomByPoints(p1, p2, targetId) {
        // Hjelper ikke så mye, vi bruker getRoomsSharingWall
        return null;
    }

    // === INPUT HANDLING ===
    function handleMouseDown(e) {
        const pos = getMousePos(e);

        if (mode === 'play') {
            handlePlayClick(pos);
            return;
        }

        // --- EDIT MODE ---
        if (tool === 'point') {
            addPoint(pos.x, pos.y);
        }
        else if (tool === 'wall') {
            const p = getClosestPoint(pos.x, pos.y);
            if (p && p.dist < CLICK_TOLERANCE) {
                if (!wallStartPoint) {
                    wallStartPoint = p.point;
                    statusText.textContent = "Startpunkt valgt. Klikk neste.";
                } else {
                    if (wallStartPoint !== p.point) {
                        addWall(wallStartPoint.id, p.point.id);
                        statusText.textContent = "Vegg laget.";
                        wallStartPoint = null; // SLIPP punktet
                    } else {
                        wallStartPoint = null; // Avbryt
                    }
                }
            } else {
                wallStartPoint = null;
            }
        }
        else if (tool === 'select') {
            const p = getClosestPoint(pos.x, pos.y);
            if (p && p.dist < CLICK_TOLERANCE) {
                draggingPoint = p.point;
                return;
            }
            const w = getClosestWall(pos.x, pos.y);
            if (w && w.dist < CLICK_TOLERANCE) {
                cycleWallColor(w.wall);
                return;
            }
            const r = getRoomAt(pos.x, pos.y);
            if (r) {
                selectedRoomId = r.id;
                draw();
            }
        }
        draw();
    }

    function handleMouseMove(e) {
        mousePos = getMousePos(e);
        
        if (mode === 'edit') {
            if (draggingPoint) {
                draggingPoint.x = mousePos.x;
                draggingPoint.y = mousePos.y;
                draw(); 
            }
            else if (tool === 'select') {
                const w = getClosestWall(mousePos.x, mousePos.y);
                hoverWall = (w && w.dist < CLICK_TOLERANCE) ? w.wall : null;
                draw();
            }
        }
    }

    function handleMouseUp(e) {
        if (mode === 'edit' && draggingPoint) {
            draggingPoint = null;
            recalculateRooms();
            draw();
        }
    }

    function handlePlayClick(pos) {
        const wObj = getClosestWall(pos.x, pos.y);
        if (!wObj || wObj.dist > CLICK_TOLERANCE) return;
        
        const wall = wObj.wall;
        const sharedRooms = getRoomsSharingWall(wall);

        if (!sharedRooms.some(r => r.id === currentRoomId)) {
            statusText.textContent = "Du må klikke på en vegg i rommet du står i.";
            shakeCanvas();
            return;
        }

        if (wall.color === 'black') {
            statusText.textContent = "Svart vegg er stengt.";
            return;
        }
        if (lastWallColor !== null && wall.color === lastWallColor) {
            statusText.textContent = `Feil! Du må bytte farge (fra ${translateColor(lastWallColor)}).`;
            shakeCanvas();
            return;
        }

        const nextRoom = sharedRooms.find(r => r.id !== currentRoomId);
        
        if (nextRoom) {
            currentRoomId = nextRoom.id;
            lastWallColor = wall.color;
            
            if (nextRoom.isGoal) {
                statusText.textContent = "MÅL NÅDD!";
                statusText.style.color = "green";
            } else {
                const req = (wall.color === 'red') ? 'BLÅ' : 'RØD';
                statusText.textContent = `Bra. Neste vegg må være ${req}.`;
                statusText.style.color = "#333";
            }
            draw();
        }
    }

    // === ACTIONS ===
    function addPoint(x, y) {
        points.push({ id: Date.now(), x, y });
        draw();
    }

    function addWall(p1Id, p2Id) {
        const exists = walls.find(w => (w.p1 === p1Id && w.p2 === p2Id) || (w.p1 === p2Id && w.p2 === p1Id));
        if (!exists) {
            // Default farge rød
            walls.push({ id: Date.now(), p1: p1Id, p2: p2Id, color: 'red' });
            recalculateRooms();
            draw();
        }
    }

    function cycleWallColor(wall) {
        if (wall.color === 'red') wall.color = 'blue';
        else if (wall.color === 'blue') wall.color = 'black';
        else if (wall.color === 'black') {
            // Slett
            walls = walls.filter(w => w.id !== wall.id);
            recalculateRooms();
        }
        draw();
    }

    function setRoomType(type) {
        if (!selectedRoomId) return;
        const r = rooms.find(r => r.id === selectedRoomId);
        if (!r) return;

        if (type === 'start') rooms.forEach(r => r.isStart = false);
        if (type === 'goal') rooms.forEach(r => r.isGoal = false);

        if (type === 'start') r.isStart = true;
        if (type === 'goal') r.isGoal = true;
        
        draw();
    }

    // === GEOMETRY HELPERS ===
    function calculateSignedArea(pts) {
        let area = 0;
        for (let i = 0; i < pts.length; i++) {
            const j = (i + 1) % pts.length;
            area += (pts[i].x * pts[j].y);
            area -= (pts[i].y * pts[j].x);
        }
        return area / 2;
    }

    function calculateCentroid(pts) {
        let cx = 0, cy = 0;
        pts.forEach(p => { cx += p.x; cy += p.y; });
        return { x: cx / pts.length, y: cy / pts.length };
    }

    function isPointInPolygon(p, polygonPts) {
        let inside = false;
        for (let i = 0, j = polygonPts.length - 1; i < polygonPts.length; j = i++) {
            const xi = polygonPts[i].x, yi = polygonPts[i].y;
            const xj = polygonPts[j].x, yj = polygonPts[j].y;
            const intersect = ((yi > p.y) !== (yj > p.y)) &&
                (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function getRoomAt(x, y) {
        for (let i = rooms.length - 1; i >= 0; i--) {
            const r = rooms[i];
            if (r.isOutside) continue;
            const pts = r.pointIds.map(id => points.find(p => p.id === id));
            if (isPointInPolygon({x,y}, pts)) return r;
        }
        return rooms.find(r => r.isOutside);
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function getClosestPoint(x, y) {
        let minDst = Infinity, closest = null;
        points.forEach(p => {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < minDst) { minDst = d; closest = p; }
        });
        return closest ? { point: closest, dist: minDst } : null;
    }

    function getClosestWall(x, y) {
        let minDst = Infinity, closest = null;
        walls.forEach(w => {
            const p1 = points.find(p => p.id === w.p1);
            const p2 = points.find(p => p.id === w.p2);
            if (p1 && p2) {
                const d = distToSegment({x,y}, p1, p2);
                if (d < minDst) { minDst = d; closest = w; }
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

    function translateColor(c) {
        return c === 'red' ? 'RØD' : 'BLÅ';
    }

    function shakeCanvas() {
        canvas.style.transform = "translateX(5px)";
        setTimeout(() => canvas.style.transform = "translateX(0)", 100);
    }

    // === DRAWING ===
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Rooms
        rooms.forEach(r => {
            if (r.isOutside) return; 
            const pts = r.pointIds.map(id => points.find(p => p.id === id));
            if (pts.length < 3) return;

            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
            ctx.closePath();

            if (r.id === selectedRoomId) ctx.fillStyle = COLORS.selected;
            else ctx.fillStyle = COLORS.inside;
            ctx.fill();

            // Labels
            if (r.isStart) {
                ctx.fillStyle = '#000';
                ctx.font = 'bold 20px Arial';
                ctx.fillText("START", r.centroid.x - 30, r.centroid.y);
            }
            if (r.isGoal) {
                ctx.fillStyle = '#000';
                ctx.font = 'bold 20px Arial';
                ctx.fillText("MÅL", r.centroid.x - 20, r.centroid.y);
            }
        });

        // 2. Walls
        walls.forEach(w => {
            const p1 = points.find(p => p.id === w.p1);
            const p2 = points.find(p => p.id === w.p2);
            if (!p1 || !p2) return;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.strokeStyle = COLORS[w.color];
            
            // Highlight solution
            if (showSolution && solutionPath.includes(w.id)) {
                ctx.lineWidth = 12;
                ctx.strokeStyle = COLORS.solutionPath;
                ctx.stroke();
                // Tegn selve veggen oppå igjen
                ctx.lineWidth = 4;
                ctx.strokeStyle = COLORS[w.color];
            }

            if (w === hoverWall) {
                ctx.lineWidth = 10;
                ctx.globalAlpha = 0.7;
            }
            
            if (w.color === 'black') ctx.setLineDash([5, 5]);
            else ctx.setLineDash([]);
            
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            ctx.setLineDash([]);
        });

        // 3. Points & Helper Lines (Edit mode)
        if (mode === 'edit') {
            if (tool === 'wall' && wallStartPoint) {
                ctx.beginPath();
                ctx.moveTo(wallStartPoint.x, wallStartPoint.y);
                ctx.lineTo(mousePos.x, mousePos.y);
                ctx.strokeStyle = '#333';
                ctx.setLineDash([5, 5]);
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.setLineDash([]);
            }

            points.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, POINT_RADIUS, 0, 2*Math.PI);
                if (p === wallStartPoint) ctx.fillStyle = COLORS.pointSelected;
                else ctx.fillStyle = COLORS.point;
                ctx.fill();
            });
        }

        // 4. Player
        if (mode === 'play' && currentRoomId) {
            const r = rooms.find(r => r.id === currentRoomId);
            if (r) {
                let x = r.centroid.x;
                let y = r.centroid.y;
                
                // Hack for outside player pos
                if (r.isOutside && r.isStart) {
                     // Tegn nær START-teksten? Vi bruker centroid for nå.
                     // For outside er centroid ofte midt i banen, som er rart.
                     // Vi kan tegne den i et hjørne hvis outside?
                     x = 50; y = 50; 
                }

                ctx.beginPath();
                ctx.arc(x, y, 15, 0, 2*Math.PI);
                ctx.fillStyle = COLORS.player;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        }
    }

    function createDefaultLevel() {
        const startX = 150;
        const startY = 100;
        const gap = 150;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                points.push({
                    id: Date.now() + Math.random(),
                    x: startX + c * gap,
                    y: startY + r * gap
                });
            }
        }
    }

    function downloadImage() {
        const wasMode = mode;
        setMode('play');
        draw();
        const link = document.createElement('a');
        link.download = `labyrint.png`;
        link.href = canvas.toDataURL();
        link.click();
        setMode(wasMode);
    }

    init();
});

/* Version: #19 */
