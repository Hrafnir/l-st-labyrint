/* Version: #8 */

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
    // Et nivå består av noder (punkter) og edges (linjer mellom dem)
    
    const levels = [
        {
            id: 1,
            name: "Nivå 1: Håndtegnet Kopi",
            // Noder: ID og posisjon (x, y) på 600x700 canvas
            nodes: [
                { id: 0, x: 550, y: 650, label: "INN" },  // Start (Nede høyre)
                { id: 1, x: 300, y: 650 },                // Bunn midt
                { id: 2, x: 50, y: 650 },                 // Bunn venstre
                { id: 3, x: 550, y: 450 },                // Høyre side 1 (opp fra start)
                { id: 4, x: 300, y: 450 },                // Senter lav
                { id: 5, x: 50, y: 400 },                 // Venstre side lav (diagonal)
                { id: 6, x: 550, y: 250 },                // Høyre side 2
                { id: 7, x: 400, y: 250 },                // Senter høy (Liten knekk)
                { id: 8, x: 300, y: 250 },                // Senter høy venstre
                { id: 9, x: 50, y: 150 },                 // Venstre side høy
                { id: 10, x: 550, y: 50, label: "UT" },   // Mål (Oppe høyre)
                { id: 11, x: 400, y: 50 },                // Topp
                { id: 12, x: 50, y: 50 }                  // Topp venstre
            ],
            // Edges: Forbindelser mellom noder. color: 'red' eller 'blue'
            edges: [
                // Fra Start (0)
                { from: 0, to: 1, color: 'blue' },   // Bunn mot venstre
                { from: 0, to: 3, color: 'red' },    // Opp langs høyre kant
                
                // Bunnrekka
                { from: 1, to: 2, color: 'blue' },
                { from: 1, to: 4, color: 'red' },    // Opp i midten
                
                // Venstre side (Diagonaler i tegningen)
                { from: 2, to: 5, color: 'blue' },   // Diagonal opp
                { from: 5, to: 4, color: 'blue' },   // Inn mot senter
                { from: 5, to: 9, color: 'blue' },   // Videre opp venstre
                
                // Senter området
                { from: 3, to: 4, color: 'blue' },   // Tverrforbindelse
                { from: 3, to: 6, color: 'red' },    // Videre opp høyre kant
                { from: 4, to: 5, color: 'blue' },   // (Allerede definert over, men sjekk retning - graf er uretet)
                
                // Komplisert midtparti
                { from: 4, to: 8, color: 'blue' },   // Senter lav til høy (blå?) - Gjetning basert på tegning
                { from: 6, to: 7, color: 'blue' },   // Inn fra høyre
                { from: 7, to: 8, color: 'red' },    // Liten knekk
                { from: 8, to: 9, color: 'red' },    // Ut mot venstre
                
                // Toppen
                { from: 6, to: 10, color: 'red' },   // Opp til mål
                { from: 9, to: 12, color: 'blue' },  // Opp venstre hjørne
                { from: 12, to: 11, color: 'black' }, // Taket? (Sort i tegning, men la oss si start/slutt ikke teller) -> Setter sort som vegg/ubrukbar eller nøytral. La oss bruke RØD for å gjøre den kjip.
                { from: 11, to: 10, color: 'blue' }, // Siste strekk mot mål
                { from: 7, to: 11, color: 'blue' }   // Opp i midten
            ],
            startNode: 0,
            goalNode: 10
        }
    ];

    // === TILSTAND ===
    let currentLevel = null;
    let currentPlayerNode = 0;
    let lastMoveColor = null; // 'red', 'blue' eller null (start)

    // === LOGGING ===
    function log(msg) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${msg}`);
        debugLog.textContent = `[${timestamp}] ${msg}\n` + debugLog.textContent;
    }

    // === MOTOR ===

    function initGame() {
        log("Starter Linje-Labyrinten...");
        loadLevel(0);

        // Event Listeners
        canvas.addEventListener('mousedown', handleCanvasClick);
        // Støtte for touch
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Hindre scroll
            handleCanvasClick(e.touches[0]);
        }, {passive: false});

        btnReset.addEventListener('click', () => {
            log("Reset level");
            loadLevel(0);
        });

        btnDownload.addEventListener('click', downloadImage);
    }

    function loadLevel(index) {
        currentLevel = levels[index];
        currentPlayerNode = currentLevel.startNode;
        lastMoveColor = null;
        
        statusElement.textContent = `Velkommen til ${currentLevel.name}`;
        statusElement.style.color = "#555";
        
        draw();
        log(`Lastet nivå: ${currentLevel.name}`);
    }

    function getMousePos(evt) {
        const rect = canvas.getBoundingClientRect();
        // Håndter både mus og touch events korrekt
        const clientX = evt.clientX;
        const clientY = evt.clientY;
        
        // Beregn skalering (hvis canvas vises mindre via CSS enn sin faktiske bredde)
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function handleCanvasClick(e) {
        const pos = getMousePos(e);
        
        // Sjekk om vi klikket på en node (nabo)
        // Vi går gjennom naboer til nåværende posisjon
        const neighbors = getNeighbors(currentPlayerNode);
        
        let clickedNode = -1;

        // Sjekk om klikk er nær en nabo-node
        neighbors.forEach(n => {
            const node = currentLevel.nodes[n.nodeId];
            const dist = Math.sqrt(Math.pow(pos.x - node.x, 2) + Math.pow(pos.y - node.y, 2));
            if (dist < 40) { // Toleranse på 40px radius
                clickedNode = n.nodeId;
            }
        });

        if (clickedNode !== -1) {
            tryMove(clickedNode);
        } else {
            // Sjekk om vi klikket på spilleren selv (valgfritt: vis info)
        }
    }

    function getNeighbors(nodeId) {
        // Finn alle edges koblet til denne noden
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
        // 1. Finn edge mellom current og target
        const edge = currentLevel.edges.find(e => 
            (e.from === currentPlayerNode && e.to === targetNodeId) || 
            (e.from === targetNodeId && e.to === currentPlayerNode)
        );

        if (!edge) {
            log("Ingen direkte linje her.");
            return;
        }

        // 2. Sjekk fargeregel
        // Regel: Ny farge MÅ være ulik forrige.
        // Unntak: Hvis lastMoveColor er null (starten), er alt lov.
        
        if (lastMoveColor !== null && edge.color === lastMoveColor) {
            log(`Ugyldig trekk! Du kom fra ${lastMoveColor}, må velge motsatt.`);
            statusElement.textContent = `Feil! Du kom fra ${translateColor(lastMoveColor)}, du må velge en annen farge.`;
            statusElement.style.color = "red";
            
            // Rist på canvas
            canvas.style.transform = "translateX(5px)";
            setTimeout(() => canvas.style.transform = "translateX(0)", 100);
            return;
        }

        // 3. Utfør flytt
        currentPlayerNode = targetNodeId;
        lastMoveColor = edge.color;
        
        log(`Flyttet til Node ${targetNodeId} via ${edge.color}.`);
        statusElement.textContent = `Bra! Neste trekk må være ${edge.color === 'red' ? 'BLÅ' : 'RØD'}.`;
        statusElement.style.color = "#555";

        // 4. Sjekk seier
        if (currentPlayerNode === currentLevel.goalNode) {
            statusElement.textContent = "GRATULERER! DU KOM UT!";
            statusElement.style.color = "green";
            log("Mål nådd!");
        }

        draw();
    }

    function translateColor(c) {
        if (c === 'red') return 'RØD';
        if (c === 'blue') return 'BLÅ';
        return c;
    }

    // === TEGNING ===

    function draw() {
        // Tøm canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Tegn linjer (edges)
        currentLevel.edges.forEach(edge => {
            const start = currentLevel.nodes[edge.from];
            const end = currentLevel.nodes[edge.to];
            
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
            // Tegn selve prikken
            ctx.beginPath();
            ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI);
            ctx.fillStyle = COLOR_NODE;
            ctx.fill();

            // Tegn tekst label hvis den finnes
            if (node.label) {
                ctx.font = "bold 16px Arial";
                ctx.fillStyle = "#000";
                // Juster tekstposisjon litt
                const xOffset = node.x > 300 ? 20 : -50;
                ctx.fillText(node.label, node.x + xOffset, node.y + 5);
            }
        });

        // Highlight gyldige trekk (Hint)
        const neighbors = getNeighbors(currentPlayerNode);
        neighbors.forEach(n => {
            // Sjekk om trekket er gyldig før vi highlighter
            const isValid = (lastMoveColor === null || n.color !== lastMoveColor);
            
            if (isValid) {
                const node = currentLevel
