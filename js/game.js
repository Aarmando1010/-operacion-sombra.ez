// OPERACIÓN SOMBRA 3D - NÚCLEO
// Arquitectura optimizada para Safari iOS
console.log("Iniciando Operación Sombra 3D...");

// Variables Globales de Estado
let scene, camera, renderer;
let isPlaying = false;
let wave = 1, kills = 0, score = 0;
let enemies = [];
let bullets = [];
let colliders = [];

// Estado del Jugador
const player = {
    hp: 100,
    speed: 0.15,
    height: 1.6,
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    pitch: 0,
    yaw: 0
};

// Controles Móviles
const joystick = { active: false, id: null, dx: 0, dy: 0, originX: 0, originY: 0 };
const touchLook = { active: false, id: null, lastX: 0, lastY: 0 };
let isFiring = false;
let lastFireTime = 0;
const FIRE_RATE = 150; // ms

// Elementos DOM
const uiMenu = document.getElementById('main-menu');
const uiHud = document.getElementById('hud');
const uiMobile = document.getElementById('mobile-controls');
const crosshair = document.getElementById('crosshair');
const damageOverlay = document.getElementById('damage-overlay');

function initGame() {
    try {
        // 1. Configuración WebGL
        const container = document.getElementById('game-container');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a1014);
        scene.fog = new THREE.Fog(0x0a1014, 5, 40); // Fog ayuda al rendimiento ocultando el fondo

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, player.height, 0);

        renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limitar a x2 para iPhone
        container.appendChild(renderer.domElement);

        // 2. Luces
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        scene.add(dirLight);

        // 3. Generar Mapa (Procedural básico para rendimiento)
        buildMap();

        // 4. Controles Táctiles
        setupControls();

        // 5. Eventos de Ventana
        window.addEventListener('resize', onWindowResize, false);

        // 6. Iniciar Loop
        animate();

        document.getElementById('debug').innerHTML += "Motor 3D Inicializado.<br>";
    } catch (e) {
        document.getElementById('debug').innerHTML += "ERROR CRÍTICO: " + e.message + "<br>";
    }
}

function buildMap() {
    // Suelo
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Paredes/Cajas
    const wallGeo = new THREE.BoxGeometry(4, 4, 4);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x273237 });

    for (let i = 0; i < 40; i++) {
        const x = (Math.random() - 0.5) * 80;
        const z = (Math.random() - 0.5) * 80;
        
        // Dejar el centro libre para el spawn del jugador
        if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;

        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(x, 2, z);
        scene.add(wall);
        
        // Crear AABB para colisiones físicas 2D (XZ)
        colliders.push({
            minX: x - 2.5, maxX: x + 2.5,
            minZ: z - 2.5, maxZ: z + 2.5
        });
    }

    // Muros perimetrales
    const perimeterGeo = new THREE.BoxGeometry(100, 10, 2);
    const perimMat = new THREE.MeshStandardMaterial({ color: 0x090d11 });
    const p1 = new THREE.Mesh(perimeterGeo, perimMat); p1.position.set(0, 5, -50);
    const p2 = new THREE.Mesh(perimeterGeo, perimMat); p2.position.set(0, 5, 50);
    const p3 = new THREE.Mesh(perimeterGeo, perimMat); p3.position.set(-50, 5, 0); p3.rotation.y = Math.PI/2;
    const p4 = new THREE.Mesh(perimeterGeo, perimMat); p4.position.set(50, 5, 0); p4.rotation.y = Math.PI/2;
    scene.add(p1); scene.add(p2); scene.add(p3); scene.add(p4);
    
    colliders.push({ minX: -50, maxX: 50, minZ: -52, maxZ: -48 });
    colliders.push({ minX: -50, maxX: 50, minZ: 48, maxZ: 52 });
    colliders.push({ minX: -52, maxX: -48, minZ: -50, maxZ: 50 });
    colliders.push({ minX: 48, maxX: 52, minZ: -50, maxZ: 50 });
}

function setupControls() {
    // Zona Movimiento (Joystick Izquierdo)
    const joyZone = document.getElementById('joystick-zone');
    const joyKnob = document.getElementById('joystick-knob');
    
    joyZone.addEventListener('pointerdown', (e) => {
        if (joystick.id !== null) return;
        joystick.id = e.pointerId;
        joystick.active = true;
        const rect = joyZone.getBoundingClientRect();
        joystick.originX = rect.left + 75; // centro del joystick
        joystick.originY = rect.top + 75;
        updateJoystick(e.clientX, e.clientY);
    });
    
    joyZone.addEventListener('pointermove', (e) => {
        if (e.pointerId === joystick.id) updateJoystick(e.clientX, e.clientY);
    });
    
    const stopJoystick = (e) => {
        if (e.pointerId === joystick.id) {
            joystick.active = false;
            joystick.id = null;
            joystick.dx = 0; joystick.dy = 0;
            joyKnob.style.transform = `translate(0px, 0px)`;
        }
    };
    joyZone.addEventListener('pointerup', stopJoystick);
    joyZone.addEventListener('pointercancel', stopJoystick);

    function updateJoystick(x, y) {
        let dx = x - joystick.originX;
        let dy = y - joystick.originY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const maxDist = 40;
        if (dist > maxDist) {
            dx = (dx/dist) * maxDist;
            dy = (dy/dist) * maxDist;
        }
        joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        joystick.dx = dx / maxDist;
        joystick.dy = dy / maxDist;
    }

    // Zona Apuntado (Derecha)
    const lookZone = document.getElementById('look-zone');
    lookZone.addEventListener('pointerdown', (e) => {
        if (touchLook.id !== null) return;
        touchLook.id = e.pointerId;
        touchLook.active = true;
        touchLook.lastX = e.clientX;
        touchLook.lastY = e.clientY;
    });

    lookZone.addEventListener('pointermove', (e) => {
        if (e.pointerId === touchLook.id && touchLook.active) {
            const deltaX = e.clientX - touchLook.lastX;
            const deltaY = e.clientY - touchLook.lastY;
            
            player.yaw -= deltaX * 0.005;
            player.pitch -= deltaY * 0.005;
            // Limitar mirar arriba/abajo
            player.pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, player.pitch));
            
            camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
            
            touchLook.lastX = e.clientX;
            touchLook.lastY = e.clientY;
        }
    });

    const stopLook = (e) => { if (e.pointerId === touchLook.id) touchLook.id = null; };
    lookZone.addEventListener('pointerup', stopLook);
    lookZone.addEventListener('pointercancel', stopLook);

    // Botón Disparo
    const btnFire = document.getElementById('btn-fire');
    btnFire.addEventListener('pointerdown', (e) => { e.preventDefault(); isFiring = true; btnFire.style.transform = 'scale(0.9)'; });
    btnFire.addEventListener('pointerup', (e) => { e.preventDefault(); isFiring = false; btnFire.style.transform = 'scale(1)'; });
    btnFire.addEventListener('pointercancel', (e) => { e.preventDefault(); isFiring = false; btnFire.style.transform = 'scale(1)'; });
}

function startGame() {
    uiMenu.style.display = 'none';
    uiHud.style.display = 'block';
    uiMobile.style.display = 'block';
    crosshair.style.display = 'block';
    
    player.hp = 100;
    kills = 0;
    wave = 1;
    updateHUD();
    
    // Resetear enemigos
    enemies.forEach(e => scene.remove(e.mesh));
    enemies = [];
    
    camera.position.set(0, player.height, 0);
    player.yaw = 0;
    player.pitch = 0;
    camera.rotation.set(0, 0, 0, 'YXZ');
    
    isPlaying = true;
}

document.getElementById('btn-start').addEventListener('click', startGame);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function spawnEnemy() {
    if (enemies.length > 8 + wave * 2) return; // Límite para rendimiento iPhone

    const enemyGeo = new THREE.CapsuleGeometry(0.6, 1.5, 4, 8); // Baja resolución geométrica
    const enemyMat = new THREE.MeshStandardMaterial({ color: 0xaa2222 });
    const mesh = new THREE.Mesh(enemyGeo, enemyMat);
    
    // Spawn lejos del jugador
    let ex, ez;
    do {
        ex = (Math.random() - 0.5) * 80;
        ez = (Math.random() - 0.5) * 80;
    } while (Math.abs(ex - camera.position.x) < 15 && Math.abs(ez - camera.position.z) < 15);
    
    mesh.position.set(ex, 1.35, ez);
    scene.add(mesh);
    
    enemies.push({
        mesh: mesh,
        hp: 30 + wave * 10,
        speed: 0.05 + (wave * 0.005)
    });
}

function shoot() {
    const now = performance.now();
    if (now - lastFireTime < FIRE_RATE) return;
    lastFireTime = now;

    // Shake de cámara simple
    camera.position.y = player.height + 0.05;
    setTimeout(() => { if (isPlaying) camera.position.y = player.height; }, 50);

    // Raycast desde centro de cámara
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const enemyMeshes = enemies.map(e => e.mesh);
    const intersects = raycaster.intersectObjects(enemyMeshes);

    if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const enemyObj = enemies.find(e => e.mesh === hitMesh);
        if (enemyObj) {
            enemyObj.hp -= 25;
            hitMesh.material.color.setHex(0xffffff); // Flash de impacto
            setTimeout(() => { if(hitMesh) hitMesh.material.color.setHex(0xaa2222); }, 100);
            
            if (enemyObj.hp <= 0) {
                scene.remove(enemyObj.mesh);
                enemies = enemies.filter(e => e !== enemyObj);
                kills++;
                if (kills % 5 === 0) wave++;
                updateHUD();
            }
        }
    }
}

function updateHUD() {
    document.getElementById('hud-hp').innerText = Math.floor(player.hp);
    document.getElementById('hud-wave').innerText = wave;
    document.getElementById('hud-kills').innerText = kills;
}

function checkCollision(nx, nz) {
    const radius = 1.0; // Radio del jugador
    for (let c of colliders) {
        if (nx + radius > c.minX && nx - radius < c.maxX &&
            nz + radius > c.minZ && nz - radius < c.maxZ) {
            return true;
        }
    }
    return false;
}

function animate() {
    requestAnimationFrame(animate);

    if (isPlaying) {
        // Movimiento Jugador
        if (joystick.dx !== 0 || joystick.dy !== 0) {
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0; forward.normalize();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            right.y = 0; right.normalize();

            // dx es izquierda/derecha, dy es adelante/atrás
            const moveVec = new THREE.Vector3()
                .addScaledVector(right, joystick.dx)
                .addScaledVector(forward, -joystick.dy)
                .normalize()
                .multiplyScalar(player.speed);

            const nextX = camera.position.x + moveVec.x;
            const nextZ = camera.position.z + moveVec.z;

            // Deslizamiento en paredes simple
            if (!checkCollision(nextX, camera.position.z)) camera.position.x = nextX;
            if (!checkCollision(camera.position.x, nextZ)) camera.position.z = nextZ;
        }

        // Disparo
        if (isFiring) shoot();

        // Lógica Enemigos (IA Persistente)
        if (Math.random() < 0.02) spawnEnemy();

        enemies.forEach(enemy => {
            const dx = camera.position.x - enemy.mesh.position.x;
            const dz = camera.position.z - enemy.mesh.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            
            if (dist > 2.5) {
                // Mover hacia jugador
                enemy.mesh.position.x += (dx/dist) * enemy.speed;
                enemy.mesh.position.z += (dz/dist) * enemy.speed;
                enemy.mesh.lookAt(camera.position.x, enemy.mesh.position.y, camera.position.z);
            } else {
                // Atacar
                player.hp -= 0.5; // Daño continuo por frame
                updateHUD();
                damageOverlay.style.opacity = 1;
                setTimeout(() => damageOverlay.style.opacity = 0, 100);
                
                if (player.hp <= 0) {
                    isPlaying = false;
                    uiMenu.style.display = 'flex';
                    uiHud.style.display = 'none';
                    uiMobile.style.display = 'none';
                    crosshair.style.display = 'none';
                    document.querySelector('h1').innerText = "MISIÓN FALLIDA";
                }
            }
        });
    }

    renderer.render(scene, camera);
}

// Iniciar al cargar scripts
window.onload = initGame;
