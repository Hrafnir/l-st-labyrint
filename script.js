/* Version: #9 */

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
    const COLOR_NODE = '#222';
    const COLOR_PLAYER = '#27ae60';
    const COLOR_HIGHLIGHT = 'rgba(241, 196, 15, 0.5)';

    // === DATASTRUKTUR ===
    // Vi lagrer nivåene i en liste. Nivå 0 er den håndtegnede kopien.
    const levels = [
        {
            id: 1,
            name: "Nivå 1: Håndtegnet Kopi",
            nodes: [
                { id: 0, x: 550, y: 650, label: "INN" },  
                { id: 1, x: 300, y: 650 },                
                { id: 2, x: 50, y: 650 },                 
                { id: 3, x: 550, y: 450 },                
                { id: 4, x: 300, y: 450 },                
                { id: 5, x: 50, y: 400 },                 
                { id: 6, x: 550, y: 250 },                
                { id: 7, x: 400, y: 250 },                
                { id: 8, x: 300, y: 250 },                
                { id: 9, x: 50, y: 150 },                 
                { id: 10, x: 550, y: 50, label: "UT" },   
                { id: 11, x: 400, y: 50 },                
                { id: 12, x: 50, y: 50 }                  
            ],
            edges: [
                { from: 0, to: 1, color: 'blue' },
                { from: 0, to: 3, color: 'red' },
                { from: 1, to: 2, color: 'blue' },
                { from: 1, to: 4, color: 'red' },
                { from: 2, to: 5, color: 'blue' },
                { from: 5, to: 4, color: 'blue' },
                { from: 5, to: 9, color: 'blue' },
                { from: 3, to: 4, color: 'blue' },
                { from: 3, to: 6, color: 'red' },
                { from: 4, to: 8, color: 'blue' },
                { from: 6, to: 7, color: 'blue' },
                { from: 7, to: 8, color: 'red' },
                { from: 8, to: 9, color: 'red' },
                { from: 6, to: 10, color: 'red' },
                { from: 9, to: 12, color: 'blue' },
                { from: 12, to: 11, color: 'red' }, // Endret til rød for variasjon
                { from: 11, to: 10, color: 'blue' },
                { from: 7, to: 11, color: 'blue' }
            ],
            startNode: 0,
            goalNode: 10
        }
    ];

    // === TILSTAND ===
    let currentLevel = null;
    let currentPlayerNode = 0;
    let lastMoveColor = null; 

    // === LOGGING ===
    function log(msg) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${msg}`);
        // Debug-logg i UI (skjult som default)
        if (debugLog) {
            debugLog.textContent = `[${timestamp}] ${msg}\n` + debugLog.textContent;
        }
    }

    // === GENERATOR ===
    function generateRandomLevel() {
        log("Genererer nytt tilfeldig nivå...");
        const nodes = [];
        const edges = [];
        const cols = 3; 
        const rows = 4;
        const padding = 80;
        const width = canvas.width - padding * 2;
        const height = canvas.height - padding * 2;
        const colStep = width / (cols - 1);
        const rowStep = height / (rows - 1);

        // 1. Opprett noder i et rutenett (med litt tilfeldig variasjon)
        let nodeIdCounter = 0;
        const grid = []; // 2D array for å finne naboer enkelt

        for (let r = 0; r < rows; r++) {
            const rowNodes = [];
            for (let c = 0; c < cols; c++) {
                // Legg til litt "wobble" på posisjonen
                const wobbleX = (Math.random() - 0.5) * 40;
                const wobbleY = (Math.random() - 0.5) * 40;
                
                const x = padding + c * colStep + wobbleX;
                const y = padding + (rows - 1 - r) * rowStep + wobbleY; // Snu Y så rad 0 er nede

                const node = {
                    id: nodeIdCounter++,
                    x: x,
                    y: y,
                    gridX: c,
                    gridY: r
                };
                nodes.push(node);
                rowNodes.push(node);
            }
            grid.push(rowNodes);
        }

        // Definer start og mål
        const startNode = nodes[0]; // Nede venstre
        startNode.label = "INN";
        const goalNode = nodes[nodes.length - 1]; // Oppe høyre
        goalNode.label = "UT";

        // 2. Opprett kanter (edges) mellom naboer
        // Koble horisontalt, vertikalt og noen diagonalt
        const potentialEdges = [];

        function addEdge(n1, n2) {
            potentialEdges.push({ from: n1.id, to: n2.id });
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const current = grid[r][c];
                
                // Høyre
                if (c < cols - 1) addEdge(current, grid[r][c + 1]);
                // Opp
                if (r < rows - 1) addEdge(current, grid[r + 1][c]);
                // Diagonal opp-høyre (50% sjanse)
                if (c < cols - 1 && r < rows - 1 && Math.random() > 0.5) {
                    addEdge(current, grid[r + 1][c + 1]);
                }
                // Diagonal opp-venstre (50% sjanse)
                if (c > 0 && r < rows - 1 && Math.random() > 0.5) {
                    addEdge(current, grid[r + 1][c - 1]);
                }
            }
        }

        // 3. Finn en sti fra Start til Mål (BFS)
        // For å garantere løsning, lager vi først en sti og farger den riktig.
        
        // Enkel graf-struktur for stifinning
        const adj = {};
        nodes.forEach(n => adj[n.id] = []);
        potentialEdges.forEach(e => {
            adj[e.from].push(e.to);
            adj[e.to].push(e.from);
        });

        // BFS
        const queue = [{ id: startNode.id, path: [] }];
        const visited = new Set([startNode.id]);
        let solutionPath = null;

        while (queue.length > 0) {
            // Tilfeldig utvalg fra køen for å få mer varierte stier enn standard BFS
            const idx = Math.floor(Math.random() * queue.length); 
            const curr = queue.splice(idx, 1)[0]; // Hent og fjern

            if (curr.id === goalNode.id) {
                solutionPath = curr.path;
                break;
            }

            const neighbors = adj[curr.id];
            // Shuffle naboer
            neighbors.sort(() => Math.random() - 0.5);

            for (const neighborId of neighbors) {
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    queue.push({ id: neighborId, path: [...curr.path, { from: curr.id, to: neighborId }] });
                }
            }
        }

        if (!solutionPath) {
            log("Feil: Fant ingen sti i genereringen. Prøver igjen...");
            return generateRandomLevel(); // Rekursivt nytt forsøk
        }

        // 4. Fargelegg løsningsstien (R-B-R-B...)
        const finalEdges = [];
        const edgesMap = new Set(); // For å unngå duplikater
        
        // Startfarge: tilfeldig rød eller blå? Nei, regel er streng: Første trekk avgjør.
        // Men vi kan bestemme at løsningen starter med f.eks Rød.
        let nextColor = Math.random() > 0.5 ? 'red' : 'blue';

        solutionPath.forEach(step => {
            finalEdges.push({ from: step.from, to: step.to, color: nextColor });
            edgesMap.add(`${Math.min(step.from, step.to)}-${Math.max(step.from, step.to)}`);
            nextColor = (nextColor === 'red') ? 'blue' : 'red';
        });

        // 5. Legg til resten av kantene med tilfeldige farger
        potentialEdges.forEach(e => {
            const key = `${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}`;
            if (!edgesMap.has(key)) {
                // Legg til med 60% sannsynlighet for å ikke overfylle brettet
                if (Math.random() < 0.6) {
                    finalEdges.push({ 
                        from: e.from, 
                        to: e.to, 
                        color: Math.random() > 0.5 ? 'red' : 'blue' 
                    });
                }
            }
        });

        return {
            id: Date.now(),
            name: "Generert Nivå",
            nodes: nodes,
            edges: finalEdges,
            startNode: startNode.id,
            goalNode: goalNode.id
        };
    }

    // === MOTOR ===

    function initGame() {
        log("Starter Linje-Labyrinten...");
        
        // Aktiver knapp
        btnGenerate.disabled = false;
        btnGenerate.textContent = "Generer Ny Bane";

        loadLevel(0);

        // Event Listeners
        canvas.addEventListener('mousedown', handleCanvasClick);
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); 
            handleCanvasClick(e.touches[0]);
        }, {passive: false});

        btnReset.addEventListener('click', () => {
            if (currentLevel.id === 1) {
                loadLevel(0);
            } else {
                // Reload nåværende genererte nivå
                currentPlayerNode = currentLevel.startNode;
                lastMoveColor = null;
                statusElement.textContent = `Nullstilt. Start ved ${getStartLabel()}.`;
                statusElement.style.color = "#555";
                draw();
            }
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
        currentPlayerNode = currentLevel.startNode;
        lastMoveColor = null;
        
        statusElement.textContent = `Klar! Start ved ${getStartLabel()}.`;
        statusElement.style.color = "#555";
        
        draw();
        log(`Lastet nivå: ${currentLevel.name}`);
    }

    function getStartLabel() {
        const n = currentLevel.nodes.find(n => n.id === currentLevel.startNode);
        return n && n.label ? n.label : "START";
    }

    function getMousePos(evt) {
        const rect = canvas.getBoundingClientRect();
        const clientX = evt.clientX;
        const clientY = evt.clientY;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function handleCanvasClick(e) {
        const pos = getMousePos(e);
        
        // Sjekk naboer for klikk
        const neighbors = getNeighbors(currentPlayerNode);
        let clickedNode = -1;

        // Sjekk også alle noder, hvis man vil trykke på en som ikke er nabo (for å se at det ikke går)
        // Men la oss holde det til naboer for enkel interaksjon.
        // Vi sjekker avstand til ALLE naboer.
        neighbors.forEach(n => {
            const node = currentLevel.nodes[n.nodeId];
            const dist = Math.sqrt(Math.pow(pos.x - node.x, 2) + Math.pow(pos.y - node.y, 2));
            if (dist < 40) { 
                clickedNode = n.nodeId;
            }
        });

        if (clickedNode !== -1) {
            tryMove(clickedNode);
        }
    }

    function getNeighbors(nodeId) {
        const neighbors = [];
        currentLevel.edges.forEach(edge => {
            if (edge.from === nodeId) {
                neighbors.push({ nodeId: edge.to, color: edge.color });
            }
            if (edge.to === nodeId) {
                neighbors.push({ nodeId: edge.from, color: edge.color });
            }
        });
        return neighbors;
    }

    function tryMove(targetNodeId) {
        // Finn edge
        const edge = currentLevel.edges.find(e => 
            (e.from === currentPlayerNode && e.to === targetNodeId) || 
            (e.from === targetNodeId && e.to === currentPlayerNode)
        );

        if (!edge) return;

        // Sjekk farge
        if (lastMoveColor !== null && edge.color === lastMoveColor) {
            log(`Ugyldig trekk! Du kom fra ${lastMoveColor}, må velge motsatt.`);
            statusElement.textContent = `Feil! Du må bytte farge (fra ${translateColor(lastMoveColor)}).`;
            statusElement.style.color = "red";
            
            // Riste-effekt (visuell CSS)
            canvas.style.transform = "translateX(5px)";
            setTimeout(() => canvas.style.transform = "translateX(0)", 100);
            return;
        }

        // Utfør flytt
        currentPlayerNode = targetNodeId;
        lastMoveColor = edge.color;
        
        statusElement.textContent = `Bra! Neste linje må være ${edge.color === 'red' ? 'BLÅ' : 'RØD'}.`;
        statusElement.style.color = "#555";

        if (currentPlayerNode === currentLevel.goalNode) {
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
        // Nullstill
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Tegn edges
        currentLevel.edges.forEach(edge => {
            const start = currentLevel.nodes.find(n => n.id === edge.from);
            const end = currentLevel.nodes.find(n => n.id === edge.to);
            
            if (!start || !end) return;

            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.lineWidth = 8;
            ctx.strokeStyle = (edge.color === 'red') ? COLOR_RED : 
                              (edge.color === 'blue') ? COLOR_BLUE : '#333';
            ctx.stroke();
        });

        // Tegn noder
        currentLevel.nodes.forEach(node => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI);
            ctx.fillStyle = COLOR_NODE;
            ctx.fill();

            if (node.label) {
                ctx.font = "bold 20px Arial";
                ctx.fillStyle = "#000";
                const xOffset = node.x > 300 ? 20 : -60;
                ctx.fillText(node.label, node.x + xOffset, node.y + 8);
            }
        });

        // Highlight gyldige trekk
        if (currentPlayerNode !== currentLevel.goalNode) {
            const neighbors = getNeighbors(currentPlayerNode);
            neighbors.forEach(n => {
                const isValid = (lastMoveColor === null || n.color !== lastMoveColor);
                if (isValid) {
                    const node = currentLevel.nodes.find(node => node.id === n.nodeId);
                    if (node) {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, 25, 0, 2 * Math.PI);
                        ctx.fillStyle = COLOR_HIGHLIGHT;
                        ctx.fill();
                    }
                }
            });
        }

        // Tegn spiller
        const playerNode = currentLevel.nodes.find(n => n.id === currentPlayerNode);
        if (playerNode) {
            ctx.beginPath();
            ctx.arc(playerNode.x, playerNode.y, 16, 0, 2 * Math.PI);
            ctx.fillStyle = COLOR_PLAYER;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = "white";
            ctx.stroke();
        }
    }

    // === EKSPORT ===
    function downloadImage() {
        // Tegn rent brett uten spiller og highlights
        const savedPlayer = currentPlayerNode;
        currentPlayerNode = -1; // Skjul spiller midlertidig
        draw(); 

        const link = document.createElement('a');
        link.download = `linjelabyrint_${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();

        // Gjenopprett
        currentPlayerNode = savedPlayer;
        draw();
    }

    // Start
    initGame();
});

/* Version: #9 */
