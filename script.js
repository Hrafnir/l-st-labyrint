/* Version: #16 */

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
        selected: 'rgba(241, 196, 15, 0.4)'
    };
    const POINT_RADIUS = 6;
    const CLICK_TOLERANCE = 12;

    // Data Model
    let points = []; // {id, x, y}
    let walls = [];  // {id, p1 (id), p2 (id), color}
    let rooms = [];  // {id, pointIds: [], isOutside, centroid: {x,y}, isStart, isGoal}
    
    // State
    let mode = 'play'; // 'play', 'edit'
    let tool = 'select'; // 'point', 'wall', 'select'
    
    // Interaction State
    let draggingPoint = null;
    let wallStartPoint = null; // Første punkt i en vegg-konstruksjon
    let selectedRoomId = null;
    let hoverWall = null;
    let mousePos = {x:0, y:0}; // For å tegne hjelpelinje
    
    // Game State
    let currentRoomId = null;
    let lastWallColor = null;

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
    
    // Buttons
    btnModePlay.addEventListener('click', () => setMode('play'));
    btnModeEdit.addEventListener('click', () => setMode('edit'));
    
    btnToolPoint.addEventListener('click', () => setTool('point'));
    btnToolWall.addEventListener('click', () => setTool('wall'));
    btnToolSelect.addEventListener('click', () => setTool('select'));
    
    btnSetStart.addEventListener('click', () => setRoomType('start'));
    btnSetGoal.addEventListener('click', () => setRoomType('goal'));
    
    btnClear.addEventListener('click', () => {
        if(confirm("Slett alt?")) {
            points = [];
            walls = [];
            rooms = [];
            currentRoomId = null;
            recalculateRooms();
            draw();
        }
    });

    btnDownload.addEventListener('click', downloadImage);

    // === MODES & TOOLS ===
    function setMode(newMode) {
        mode = newMode;
        // Reset interaction states
        wallStartPoint = null;
        draggingPoint = null;

        if (mode === 'play') {
            btnModePlay.classList.add('active');
            btnModeEdit.classList.remove('active');
            editTools.style.display = 'none';
            statusText.textContent = "Spillmodus: Klikk på en vegg for å gå.";
            selectedRoomId = null;
            
            // Initialiser spill
            const startRoom = rooms.find(r => r.isStart);
            if (startRoom) currentRoomId = startRoom.id;
            else if (rooms.length > 0) currentRoomId = rooms.find(r => r.isOutside)?.id || rooms[0].id;
            lastWallColor = null;

        } else {
            btnModeEdit.classList.add('active');
            btnModePlay.classList.remove('active');
            editTools.style.display = 'flex';
            statusText.textContent = "Redigering: Velg verktøy.";
            // Default til vegg-verktøy da det er mest brukt
            setTool('wall');
        }
        draw();
    }

    function setTool(newTool) {
        tool = newTool;
        // Reset states når vi bytter verktøy
        wallStartPoint = null;
        draggingPoint = null;
        
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        if (tool === 'point') {
            btnToolPoint.classList.add('active');
            statusText.textContent = "Punkt-modus: Klikk for å lage nye punkter.";
        }
        if (tool === 'wall') {
            btnToolWall.classList.add('active');
            statusText.textContent = "Vegg-modus: Klikk på punkt A, flytt musen, klikk på punkt B.";
        }
        if (tool === 'select') {
            btnToolSelect.classList.add('active');
            statusText.textContent = "Velg-modus: Flytt punkter, endre veggfarge, velg rom.";
        }
        draw();
    }

    // === CORE LOGIC: ROOM FINDER ===
    function recalculateRooms() {
        const oldStart = rooms.find(r => r.isStart);
        const oldGoal = rooms.find(r => r.isGoal);
        const oldStartCenter = oldStart ? oldStart.centroid : null;
        const oldGoalCenter = oldGoal ? oldGoal.centroid : null;

        rooms = [];
        
        // 1. Bygg adjacency list
        const adj = {};
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
            
            for (let i = 0; i < neighbors.length; i++) {
                const edgeKey = `${startNode}-${neighbors[i].neighborId}`;
                
                if (!visitedEdges.has(edgeKey)) {
                    const path = [];
                    let curr = startNode;
                    let nextInfo = neighbors[i];
                    
                    while (!visitedEdges.has(`${curr}-${nextInfo.neighborId}`)) {
                        visitedEdges.add(`${curr}-${nextInfo.neighborId}`);
                        path.push(curr);
                        
                        const prevNode = curr;
                        curr = nextInfo.neighborId;
                        
                        const currNeighbors = adj[curr];
                        const backIndex = currNeighbors.findIndex(n => n.neighborId === prevNode);
                        
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

        // 3. Identifiser Utsiden (størst areal)
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

        roomCountText.textContent = `${rooms.length} Rom (1 Utside + ${Math.max(0, rooms.length-1)} Inne)`;
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
        // Sjekk indre rom først
        for (let i = rooms.length - 1; i >= 0; i--) {
            const r = rooms[i];
            if (r.isOutside) continue;
            const pts = r.pointIds.map(id => points.find(p => p.id === id));
            if (isPointInPolygon({x,y}, pts)) return r;
        }
        return rooms.find(r => r.isOutside);
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
            // Legg til nytt punkt
            addPoint(pos.x, pos.y);
        }
        else if (tool === 'wall') {
            // Vegg-logikk: Klikk A -> Klikk B
            const p = getClosestPoint(pos.x, pos.y);
            
            if (p && p.dist < CLICK_TOLERANCE) {
                // Vi traff et punkt
                if (!wallStartPoint) {
                    // Steg 1: Velg startpunkt
                    wallStartPoint = p.point;
                    statusText.textContent = "Startpunkt valgt. Klikk på neste punkt.";
                } else {
                    // Steg 2: Vi har allerede et startpunkt
                    if (wallStartPoint !== p.point) {
                        addWall(wallStartPoint.id, p.point.id);
                        statusText.textContent = "Vegg laget. Velg nytt startpunkt eller fortsett.";
                        // Vi beholder IKKE startpunktet for å lage "polylines" automatisk, 
                        // men nullstiller for å la brukeren velge fritt.
                        // Alternativt: wallStartPoint = p.point; (for å tegne videre)
                        wallStartPoint = null; 
                    } else {
                        // Klikket på samme punkt igjen -> Avbryt
                        wallStartPoint = null;
                        statusText.textContent = "Avbrutt.";
                    }
                }
            } else {
                // Klikket i løse luften -> Avbryt
                wallStartPoint = null;
                statusText.textContent = "Klikk på et punkt for å starte en vegg.";
            }
        }
        else if (tool === 'select') {
            // 1. Dra punkt
            const p = getClosestPoint(pos.x, pos.y);
            if (p && p.dist < CLICK_TOLERANCE) {
                draggingPoint = p.point;
                return;
            }

            // 2. Endre veggfarge
            const w = getClosestWall(pos.x, pos.y);
            if (w && w.dist < CLICK_TOLERANCE) {
                cycleWallColor(w.wall);
                return;
            }

            // 3. Velg rom
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
                // Live update er tungt, men ser bra ut.
                // For optimalisering: kun tegn punkter/vegger, ikke kjør recalculateRooms her.
                draw(); 
            }
            else if (tool === 'select') {
                const w = getClosestWall(mousePos.x, mousePos.y);
                hoverWall = (w && w.dist < CLICK_TOLERANCE) ? w.wall : null;
                draw();
            }
            else if (tool === 'wall' && wallStartPoint) {
                // Tegn hjelpelinje i draw()
                draw();
            }
        }
    }

    function handleMouseUp(e) {
        if (mode === 'edit' && draggingPoint) {
            draggingPoint = null;
            recalculateRooms(); // Beregn rom når vi slipper punktet
            draw();
        }
    }

    function handlePlayClick(pos) {
        const wObj = getClosestWall(pos.x, pos.y);
        if (!wObj || wObj.dist > CLICK_TOLERANCE) return;
        
        const wall = wObj.wall;
        
        // Sjekk om veggen tilhører rommet vi står i
        const adjacentRooms = rooms.filter(r => {
            const hasP1 = r.pointIds.includes(wall.p1);
            const hasP2 = r.pointIds.includes(wall.p2);
            return hasP1 && hasP2; 
        });

        if (!adjacentRooms.some(r => r.id === currentRoomId)) {
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

        const nextRoom = adjacentRooms.find(r => r.id !== currentRoomId);
        
        if (nextRoom) {
            currentRoomId = nextRoom.id;
            lastWallColor = wall.color;
            
            if (nextRoom.isGoal) {
                statusText.textContent = "MÅL NÅDD! Gratulerer!";
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
            walls.push({ id: Date.now(), p1: p1Id, p2: p2Id, color: 'red' });
            recalculateRooms();
            draw();
        }
    }

    function cycleWallColor(wall) {
        if (wall.color === 'red') wall.color = 'blue';
        else if (wall.color === 'blue') wall.color = 'black';
        else if (wall.color === 'black') {
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

    // === HELPERS ===
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
                ctx.font = 'bold 16px Arial';
                ctx.fillText("START", r.centroid.x - 20, r.centroid.y);
            }
            if (r.isGoal) {
                ctx.fillStyle = '#000';
                ctx.font = 'bold 16px Arial';
                ctx.fillText("MÅL", r.centroid.x - 15, r.centroid.y);
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
            // Hjelpelinje for vegg
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
                // Hvis outside, prøv å plasser spilleren nær start-teksten eller et fornuftig sted
                let x = r.centroid.x;
                let y = r.centroid.y;
                
                // Hack for å vise spilleren på utsiden hvis sentroiden er midt i banen
                if (r.isOutside) {
                     // Finn et punkt utenfor bounding box av alle indre punkter?
                     // Enklere: Hvis start er satt på utsiden, tegn den ved siden av START teksten
                     if (r.isStart) {
                         x = 100; y = 100; // Default hjørne
                         // Prøv å finn et punkt nær første vegg?
                     }
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
        // Rent rutenett av punkter
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

/* Version: #16 */
