document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// State
let currentUser = null;
let userProfile = null;
let allSocios = [];
let allLotes = [];
let filteredSocios = [];
let filteredLotes = [];

// Constants
const REGULARIZACION_CORTE_FECHA = '2025-11-30';

// DOM Elements
const loginView = document.getElementById('login-view');
const appLayout = document.getElementById('app-layout');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const togglePasswordBtn = document.getElementById('toggle-password');
const passwordInput = document.getElementById('password');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const sidebar = document.getElementById('sidebar');
const logoutBtn = document.getElementById('logout-btn');
const mainContent = document.getElementById('main-content');
const navItems = document.querySelectorAll('.nav-item');
const userNameDisplay = document.getElementById('user-name');
const userRoleDisplay = document.getElementById('user-role');
const appLoader = document.getElementById('app-loader');
const appLoaderText = document.getElementById('app-loader-text');

// Socio modal elements (global)
const socioModal = document.getElementById('socio-modal');
const socioModalCedula = document.getElementById('socio-modal-cedula');
const socioModalNombre = document.getElementById('socio-modal-nombre');
const socioModalActivo = document.getElementById('socio-modal-activo');
const socioModalGuardar = document.getElementById('socio-modal-guardar');
const socioModalMsg = document.getElementById('socio-modal-msg');

// Socio create modal elements (global)
const socioCreateModal = document.getElementById('socio-create-modal');
const socioCreateCedula = document.getElementById('socio-create-cedula');
const socioCreateNombre = document.getElementById('socio-create-nombre');
const socioCreateCelular = document.getElementById('socio-create-celular');
const socioCreateCorreo = document.getElementById('socio-create-correo');
const socioCreateDesde = document.getElementById('socio-create-desde');
const socioCreateActivo = document.getElementById('socio-create-activo');
const socioCreateGuardar = document.getElementById('socio-create-guardar');
const socioCreateMsg = document.getElementById('socio-create-msg');

// View cache
const viewCache = new Map(); // viewName -> { containerEl: HTMLElement, initialized: boolean }
let currentViewName = null;

// Loader state (re-entrant)
let loaderCount = 0;

/**
 * Custom Confirmation Dialog
 */
function showConfirm(title, message) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const bodyEl = document.getElementById('confirm-body');
    const btnYes = document.getElementById('confirm-btn-yes');
    const btnNo = document.getElementById('confirm-btn-no');
    const btnClose = document.getElementById('confirm-close');

    titleEl.textContent = title;
    bodyEl.innerHTML = message;
    btnYes.style.display = '';
    btnNo.textContent = 'No, cancelar';
    btnYes.textContent = 'Sí, continuar';
    
    modal.classList.remove('hidden');

    return new Promise((resolve) => {
        const handleYes = () => { cleanup(); resolve(true); };
        const handleNo = () => { cleanup(); resolve(false); };
        const cleanup = () => {
            modal.classList.add('hidden');
            btnYes.removeEventListener('click', handleYes);
            btnNo.removeEventListener('click', handleNo);
            btnClose.removeEventListener('click', handleNo);
        };
        btnYes.addEventListener('click', handleYes);
        btnNo.addEventListener('click', handleNo);
        btnClose.addEventListener('click', handleNo);
    });
}

/**
 * Custom Alert Dialog
 */
function showAlert(title, message) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const bodyEl = document.getElementById('confirm-body');
    const btnYes = document.getElementById('confirm-btn-yes');
    const btnNo = document.getElementById('confirm-btn-no');
    const btnClose = document.getElementById('confirm-close');

    titleEl.textContent = title;
    bodyEl.innerHTML = message;
    btnYes.style.display = 'none';
    btnNo.textContent = 'Aceptar';
    
    modal.classList.remove('hidden');

    return new Promise((resolve) => {
        const handleOk = () => {
            modal.classList.add('hidden');
            btnNo.removeEventListener('click', handleOk);
            btnClose.removeEventListener('click', handleOk);
            resolve();
        };
        btnNo.addEventListener('click', handleOk);
        btnClose.addEventListener('click', handleOk);
    });
}

// Initialization
async function initApp() {
    const client = getSupabaseClient();
    if (!client) {
        console.error('Supabase client not initialized');
        return;
    }

    // Check session
    const { data: { session } } = await client.auth.getSession();

    if (session) {
        await handleSession(session);
    } else {
        showLogin();
    }

    setupEventListeners();
}

function setupEventListeners() {
    // Login Form
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        await login(email, password);
    });

    // Toggle Password
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePasswordBtn.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });

    // Sidebar Menu Toggle - funciona en todas las pantallas
    mobileMenuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // Sidebar Close Button
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => {
            sidebar.classList.remove('open');
        });
    }

    const quickHomeBtn = document.getElementById('quick-home-btn');
    if (quickHomeBtn) {
        quickHomeBtn.addEventListener('click', () => {
            setActiveNav('dashboard');
            loadView('dashboard');
        });
    }

    // Close sidebar when clicking outside (tanto en mobile como desktop)
    document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) &&
            !mobileMenuToggle.contains(e.target) &&
            !quickHomeBtn?.contains(e.target) &&
            sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });

    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            loadView(view);

            // Update active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Cerrar sidebar automáticamente al seleccionar un módulo
            sidebar.classList.remove('open');
        });
    });

    // Logout
    logoutBtn.addEventListener('click', logout);

    // Modal close handlers
    if (socioModal) {
        socioModal.querySelectorAll('[data-modal-close="true"]').forEach(el => {
            el.addEventListener('click', () => closeSocioModal());
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && socioModal && !socioModal.classList.contains('hidden')) {
                closeSocioModal();
            }
        });

        if (socioModalGuardar) {
            socioModalGuardar.addEventListener('click', saveSocioEstado);
        }
    }

    if (socioCreateModal) {
        socioCreateModal.querySelectorAll('[data-modal-close="true"]').forEach(el => {
            el.addEventListener('click', () => closeSocioCreateModal());
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && socioCreateModal && !socioCreateModal.classList.contains('hidden')) {
                closeSocioCreateModal();
            }
        });
        if (socioCreateGuardar) {
            socioCreateGuardar.addEventListener('click', saveNewSocio);
        }
    }
}

// Auth Logic
async function login(email, password) {
    showError('');
    const client = getSupabaseClient();

    try {
        // 1. Authenticate with Supabase Auth
        const { data: authData, error: authError } = await client.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (authError) {
            // Generic error for security
            throw new Error('Credenciales incorrectas');
        }

        // 2. Check unoric_usuarios table
        const { data: userData, error: userError } = await client
            .from('unoric_usuarios')
            .select('*')
            .eq('correo', email)
            .single();

        if (userError || !userData) {
            // User authenticated but not in our custom table
            // Sign out immediately
            await client.auth.signOut();
            throw new Error('Credenciales incorrectas');
        }

        // 3. Check if active
        if (userData.activo !== true) {
            await client.auth.signOut();
            throw new Error('Cuenta inactiva. Contacte al administrador.');
        }

        // Success
        await handleSession(authData.session, userData);

    } catch (error) {
        showError(error.message);
    }
}

async function handleSession(session, userData = null) {
    currentUser = session.user;
    const client = getSupabaseClient();

    if (!userData) {
        // Fetch user data if not provided (e.g. on page reload)
        const { data, error } = await client
            .from('unoric_usuarios')
            .select('*')
            .eq('correo', currentUser.email)
            .single();

        if (error || !data || data.activo !== true) {
            await client.auth.signOut();
            showLogin();
            return;
        }
        userProfile = data;
    } else {
        userProfile = userData;
    }

    updateUI();
    showApp();
    setActiveNav('dashboard');
    loadView('dashboard'); // Default view

    // Precarga de datos en segundo plano para que los módulos estén listos
    preloadAllData();
}

function setActiveNav(viewName) {
    const name = String(viewName || '').trim();
    navItems.forEach(nav => nav.classList.remove('active'));
    const match = Array.from(navItems).find(nav => nav.dataset.view === name);
    if (match) match.classList.add('active');
}

async function logout() {
    const client = getSupabaseClient();
    await client.auth.signOut();
    currentUser = null;
    userProfile = null;
    showLogin();
}

// UI Helpers
function showLogin() {
    loginView.classList.remove('hidden');
    appLayout.classList.add('hidden');
    loginForm.reset();
    showError('');
}

function showApp() {
    loginView.classList.add('hidden');
    appLayout.classList.remove('hidden');
    startLivePoller();
}

function updateUI() {
    if (userProfile) {
        userNameDisplay.textContent = userProfile.nombre;
        userRoleDisplay.textContent = userProfile.rol;
    }

    applyModuleVisibility();
}

function showError(message) {
    if (message) {
        loginError.textContent = message;
        loginError.style.display = 'block';
    } else {
        loginError.style.display = 'none';
    }
}

function showAppLoader(message = 'Cargando...') {
    if (!appLoader) return;
    if (appLoaderText) appLoaderText.textContent = message;
    appLoader.classList.remove('hidden');
    appLoader.setAttribute('aria-hidden', 'false');
}

function hideAppLoader() {
    if (!appLoader) return;
    appLoader.classList.add('hidden');
    appLoader.setAttribute('aria-hidden', 'true');
}

function beginLoading(message = 'Cargando...') {
    loaderCount += 1;
    showAppLoader(message);
}

function endLoading() {
    loaderCount = Math.max(0, loaderCount - 1);
    if (loaderCount === 0) hideAppLoader();
}

async function withLoader(message, fn) {
    beginLoading(message);
    try {
        return await fn();
    } finally {
        endLoading();
    }
}

/**
 * Formatea una fecha (Date o 'YYYY-MM-DD') al formato largo: "DD de mes de YYYY"
 */
function formatDateLong(date) {
    if (!date) return '';
    let d = date;
    if (typeof date === 'string') {
        const parts = date.split('-');
        if (parts.length !== 3) return date;
        // Creamos la fecha usando componentes locales para evitar desfases de zona horaria
        d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else if (!(date instanceof Date)) {
        return String(date);
    }
    
    const day = d.getDate();
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} de ${monthName} de ${year}`;
}

// View Loader
async function loadView(viewName) {
    try {
        // If already on same view, don't reload.
        if (currentViewName === viewName) return;

        // If cached, swap instantly.
        // EXCEPCIÓN: Módulo crear_cuotas no usa caché de vista para asegurar datos frescos
        const cached = viewCache.get(viewName);
        if (cached && cached.initialized && viewName !== 'crear_cuotas') {
            mainContent.innerHTML = '';
            mainContent.appendChild(cached.containerEl);
            currentViewName = viewName;
            return;
        }

        beginLoading('Cargando módulo...');
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) throw new Error('View not found');
        const html = await response.text();

        // Cache DOM container to avoid re-fetch & re-init next time.
        const containerEl = document.createElement('div');
        containerEl.innerHTML = html;
        viewCache.set(viewName, { containerEl, initialized: false });

        mainContent.innerHTML = '';
        mainContent.appendChild(containerEl);

        // Initialize module logic
        if (viewName === 'dashboard') {
            await initDashboardModule();
        } else if (viewName === 'socios') {
            await initSociosModule();
        } else if (viewName === 'lotes') {
            await initLotesModule();
        } else if (viewName === 'caja') {
            await initCajaModule();
        } else if (viewName === 'crear_cuotas') {
            await initCrearCuotasModule();
        } else if (viewName === 'cobros') {
            await initCobrosModule();
        } else if (viewName === 'mensualidad') {
            await initMensualidadModule();
        } else if (viewName === 'convocatorias') {
            await initConvocatoriasModule();
        } else if (viewName === 'regularizacion') {
            await initRegularizacionModule();
        } else if (viewName === 'tipos_pago') {
            await initTiposPagoModule();
        } else if (viewName === 'pdf') {
            await initPdfModule();
        }

        const entry = viewCache.get(viewName);
        if (entry) entry.initialized = true;
        currentViewName = viewName;
        endLoading();
    } catch (error) {
        endLoading();
        mainContent.innerHTML = `<div class="error-message">Error cargando el módulo: ${error.message}</div>`;
    }
}

// ==========================================
// SHARED HELPERS (PAGOS)
// ==========================================
function isAdmin() {
    return (userProfile?.rol || '').toLowerCase() === 'admin';
}

function parseUserModules(modulosRaw) {
    if (!modulosRaw) return null;
    if (Array.isArray(modulosRaw)) return modulosRaw.map(m => String(m).toLowerCase().trim()).filter(Boolean);

    const raw = String(modulosRaw).trim();
    if (!raw) return null;

    // Try JSON array
    if (raw.startsWith('[')) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map(m => String(m).toLowerCase().trim()).filter(Boolean);
        } catch (_) {
            // ignore
        }
    }

    return raw
        .split(/[;,\n\r\t ]+/)
        .map(m => m.toLowerCase().trim())
        .filter(Boolean);
}

function userHasModule(moduleKey) {
    const key = String(moduleKey || '').toLowerCase().trim();
    if (!key) return true;
    if (isAdmin()) return true;

    const modules = parseUserModules(userProfile?.modulos);
    if (!modules) return true; // If not configured, don't block UI
    return modules.includes(key);
}

function applyModuleVisibility() {
    // Hide/Show menu entries based on userProfile.modulos (visual control) + role.
    const items = document.querySelectorAll('.nav-item');
    items.forEach(item => {
        const view = item.dataset.view;
        const moduleKey = item.dataset.module || view;

        // Dashboard and PDF are always visible
        if (view === 'dashboard' || view === 'pdf') {
            item.style.display = '';
            return;
        }

        // Regularización y Tipos de pago: solo admin por definición.
        const requiresAdmin = moduleKey === 'regularizacion' || moduleKey === 'tipos_pago';

        const allowed = userHasModule(moduleKey) && (!requiresAdmin || isAdmin());
        item.style.display = allowed ? '' : 'none';
    });
}

async function initPdfModule() {
    // Reuse same generator UI ids (dash-pdf-*)
    initDashboardPdfModule();

    // Dedicated PDF view extras
    initPdfCustomColumnsUi();
    initPdfPreviewUi();

    // Auto-render preview on entry
    schedulePdfPreviewRefresh(true);
}

// ==========================================
// HELPER - Estado de socio (debe estar antes del dashboard)
// ==========================================
function isSocioActivoValue(val) {
    // null/undefined -> treat as active (default true in DB)
    return val !== false;
}

function normalizePagoEstado(val) {
    return String(val || '').trim().toUpperCase();
}

// ==========================================
// PRECARGA DE DATOS AL INICIAR SESIÓN
// ==========================================
async function preloadAllData() {
    try {
        const client = getSupabaseClient();

        // Precargar socios
        const { data: socios, error: sociosError } = await client
            .from('unoric_socios')
            .select('*')
            .order('socio', { ascending: true });

        if (sociosError) throw sociosError;

        // Precargar lotes
        const { data: lotes, error: lotesError } = await client
            .from('unoric_lotes')
            .select('*');

        if (lotesError) throw lotesError;

        // Guardar en memoria global
        allLotes = lotes || [];
        allSocios = (socios || []).map(s => ({
            ...s,
            lotes: allLotes.filter(l => l.socio === s.cedula)
        }));

        // Cache persistente (ligero)
        writeSociosQuickCache(allSocios);
        writeLotesCache(allLotes);

        console.log(`Precarga completada: ${allSocios.length} socios y ${allLotes.length} lotes cacheados.`);
    } catch (err) {
        console.warn('Error en precarga de datos:', err);
    }
}

// ==========================================
// DASHBOARD (INICIO) - CON CACHÉ
// ==========================================

// Cache keys para dashboard
const DASHBOARD_CACHE_KEY = 'unoric_dashboard_cache_v1';
const LOTES_CACHE_KEY = 'unoric_lotes_cache_v1';
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24 horas

// Escribir caché del dashboard
function writeDashboardCache(stats) {
    try {
        const payload = { ts: Date.now(), data: stats };
        localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload));
    } catch (e) { console.warn('Error escribiendo cache dashboard', e); }
}

// Leer caché del dashboard
function readDashboardCache() {
    try {
        const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts > CACHE_MAX_AGE_MS) {
            localStorage.removeItem(DASHBOARD_CACHE_KEY);
            return null;
        }
        return parsed.data;
    } catch (e) { return null; }
}

// Escribir caché de lotes
function writeLotesCache(lotes) {
    try {
        const payload = { ts: Date.now(), data: lotes };
        localStorage.setItem(LOTES_CACHE_KEY, JSON.stringify(payload));
    } catch (e) { console.warn('Error escribiendo cache lotes', e); }
}

// Leer caché de lotes
function readLotesCache() {
    try {
        const raw = localStorage.getItem(LOTES_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts > CACHE_MAX_AGE_MS) {
            localStorage.removeItem(LOTES_CACHE_KEY);
            return null;
        }
        return parsed.data;
    } catch (e) { return null; }
}

// Renderizar estadísticas en el dashboard
function renderDashboardStats(stats) {
    const els = {
        totalSocios: document.getElementById('dash-total-socios'),
        sociosActivos: document.getElementById('dash-socios-activos'),
        sociosRetirados: document.getElementById('dash-socios-retirados'),
        totalLotes: document.getElementById('dash-total-lotes'),
        lotesPromesa: document.getElementById('dash-lotes-promesa'),
        etapa1: document.getElementById('dash-etapa1'),
        etapa2: document.getElementById('dash-etapa2'),
        etapa3: document.getElementById('dash-etapa3'),
        eventosCard: document.getElementById('dash-eventos-card'),
        eventosActivosCount: document.getElementById('dash-eventos-activos')
    };

    if (els.totalSocios) els.totalSocios.textContent = stats.totalSocios ?? '--';
    if (els.sociosActivos) els.sociosActivos.textContent = `${stats.sociosActivos ?? '--'} activos`;
    if (els.sociosRetirados) els.sociosRetirados.textContent = `${stats.sociosRetirados ?? '--'} retirados`;
    if (els.totalLotes) els.totalLotes.textContent = stats.totalLotes ?? '--';
    if (els.lotesPromesa) els.lotesPromesa.textContent = `${stats.lotesPromesa ?? '--'} con promesa`;
    if (els.etapa1) els.etapa1.textContent = stats.etapa1 ?? '--';
    if (els.etapa2) els.etapa2.textContent = stats.etapa2 ?? '--';
    if (els.etapa3) els.etapa3.textContent = stats.etapa3 ?? '--';

    if (els.eventosActivosCount) {
        els.eventosActivosCount.textContent = stats.eventosActivos ?? '0';
        if (els.eventosCard) {
            els.eventosCard.style.display = (stats.eventosActivos > 0) ? 'flex' : 'none';
        }
    }
}

// Obtener estadísticas desde Supabase
async function fetchDashboardStats() {
    const client = getSupabaseClient();

    // Fetch socios
    const { data: socios, error: sociosErr } = await client
        .from('unoric_socios')
        .select('cedula, estado');

    if (sociosErr) throw sociosErr;

    // Fetch lotes
    const { data: lotes, error: lotesErr } = await client
        .from('unoric_lotes')
        .select('*');

    if (lotesErr) throw lotesErr;

    // Fetch eventos activos (Solo próximos en < 50 min o En curso)
    let eventosActivos = 0;
    try {
        const { data: eventos, error: evErr } = await client
            .from('unoric_eventos')
            .select('*')
            .not('estado', 'in', '("FINALIZADO","CANCELADO")');
        
        if (!evErr && eventos) {
            const now = new Date();
            const filtered = eventos.filter(ev => {
                const [y, mm, d] = ev.fecha.split('-').map(Number);
                const [hh, min] = ev.hora_inicio.split(':').map(Number);
                const eventDateTime = new Date(y, mm - 1, d, hh, min);
                
                const diffMs = eventDateTime - now;
                const diffMin = diffMs / (1000 * 60);
                
                // En curso (ya empezó) o Iniciando pronto (<= 50 min)
                return (now >= eventDateTime) || (diffMin > 0 && diffMin <= 50);
            });
            eventosActivos = filtered.length;
        }
    } catch (e) {
        console.warn('Error fetching event count:', e);
    }

    // Guardar lotes en cache para uso posterior
    writeLotesCache(lotes);

    // Calcular stats
    const totalSocios = socios.length;
    const sociosActivos = socios.filter(s => isSocioActivoValue(s.estado)).length;
    const sociosRetirados = totalSocios - sociosActivos;

    const totalLotes = lotes.length;
    const lotesPromesa = lotes.filter(l => String(l.promesa).toUpperCase() === 'SI').length;
    const etapa1 = lotes.filter(l => Number(l.etapa) === 1).length;
    const etapa2 = lotes.filter(l => Number(l.etapa) === 2).length;
    const etapa3 = lotes.filter(l => Number(l.etapa) === 3).length;

    return {
        totalSocios,
        sociosActivos,
        sociosRetirados,
        totalLotes,
        lotesPromesa,
        etapa1,
        etapa2,
        etapa3,
        eventosActivos
    };
}

// Obtener saludo basado en la hora del día
function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Buenos días';
    if (hour >= 12 && hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
}

async function initDashboardModule() {
    const grid = document.getElementById('dash-grid');
    const msgEl = document.getElementById('dash-msg');
    const greetingEl = document.getElementById('dash-greeting');
    if (!grid) return;

    // Mostrar saludo personalizado
    if (greetingEl && userProfile && userProfile.nombre) {
        const greeting = getTimeBasedGreeting();
        greetingEl.textContent = `${greeting}, ${userProfile.nombre}`;
    }

    function allowedFor(view) {
        const v = String(view || '').trim();
        if (!v) return false;
        if (v === 'dashboard' || v === 'pdf') return true;
        if (v === 'new_socio' || v === 'crear_cuotas') return isAdmin();
        
        const requiresAdmin = v === 'regularizacion' || v === 'tipos_pago';
        return userHasModule(v) && (!requiresAdmin || isAdmin());
    }

    // Hide cards the user can't access
    grid.querySelectorAll('[data-dash-item]').forEach(card => {
        const v = card.getAttribute('data-dash-item');
        card.style.display = allowedFor(v) ? '' : 'none';

        // Hacer toda la tarjeta cliqueable
        card.addEventListener('click', async (e) => {
            const to = card.getAttribute('data-dash-item');

            if (to === 'new_socio') {
                if (!isAdmin()) {
                    setInlineMessage(msgEl, 'Acceso restringido: solo ADMIN puede crear socios.', 'error');
                    return;
                }
                setInlineMessage(msgEl, '', '');
                setActiveNav('socios');
                await loadView('socios');
                openSocioCreateModal();
            } else {
                if (!allowedFor(to)) {
                    setInlineMessage(msgEl, 'No tienes acceso a este módulo.', 'error');
                    return;
                }
                setInlineMessage(msgEl, '', '');
                setActiveNav(to);
                loadView(to);
            }
        });
    });

    // PDF report section (dashboard)
    initDashboardPdfModule();

    // === CARGAR ESTADÍSTICAS ===

    // 1. Cargar desde caché inmediatamente (carga instantánea)
    const cachedStats = readDashboardCache();
    if (cachedStats) {
        renderDashboardStats(cachedStats);
    }

    // 2. Actualizar en segundo plano
    try {
        const freshStats = await fetchDashboardStats();
        writeDashboardCache(freshStats);
        renderDashboardStats(freshStats);
    } catch (err) {
        console.error('Error cargando estadísticas del dashboard:', err);
        // Si hay caché, ya se mostró; si no, mostrar error
        if (!cachedStats) {
            setInlineMessage(msgEl, 'Error cargando estadísticas. Intenta recargar.', 'error');
        }
    }
}

// ==========================================
// DASHBOARD - REPORTES PDF
// ==========================================

const DASH_PDF_LOGO_URL = 'https://i.ibb.co/rRLTLtty/Gemini-Generated-Image-yqe70kyqe70kyqe7.png';

/**
 * Lógica para botones de eventos en vivo ("EN CURSO")
 */
let livePollInterval = null;

async function updateLiveEventButtons() {
    const container = document.getElementById('live-events-container');
    if (!container) return;

    try {
        const client = getSupabaseClient();
        const { data: eventos, error } = await client
            .from('unoric_eventos')
            .select('*')
            .not('estado', 'in', '("FINALIZADO","CANCELADO")');

        if (error) throw error;

        const now = new Date();
        const enCurso = (eventos || []).filter(ev => {
            const eventDateTime = new Date(`${ev.fecha}T${ev.hora_inicio}`);
            return now >= eventDateTime;
        });

        if (enCurso.length === 0) {
            container.innerHTML = '';
        } else {
            container.innerHTML = enCurso.map((ev, idx) => {
                const colors = ['blue', 'red', 'green', 'yellow', 'orange', 'black'];
                const color = colors[idx % colors.length];
                const topOffset = 4.25 + ((idx + 1) * 3.25); // Espaciado consistente con Hamburger (1rem) y Home (4.25rem)
                return `
                    <button class="live-event-btn btn-${color}" 
                            style="top: ${topOffset}rem;" 
                            title="EN VIVO: ${ev.tipo} - ${ev.descripcion}"
                            onclick="goToLiveEvent('${ev.id}')">
                        <i class="fas fa-bullhorn rotate-bullhorn"></i>
                        <div class="live-dot"></div>
                    </button>
                `;
            }).join('');
        }

        // Si estamos en la vista de convocatorias, refrescar el listado también
        if (typeof window.refreshConvocatorias === 'function') {
            await window.refreshConvocatorias();
        }

    } catch (e) {
        console.error('Error actualizando botones live:', e);
    }
}

// Ventana global para abrir eventos desde el botón lateral
window.goToLiveEvent = async function(eventoId) {
    window.autoOpenEventoId = eventoId;
    setActiveNav('convocatorias');
    await loadView('convocatorias');
};

function startLivePoller() {
    if (livePollInterval) clearInterval(livePollInterval);
    updateLiveEventButtons();
    livePollInterval = setInterval(updateLiveEventButtons, 60000); // Cada minuto
}

function initDashboardPdfModule() {
    const generateBtn = document.getElementById('dash-pdf-socios-generate');
    if (!generateBtn) return;

    // Prevent duplicate bindings in weird re-mount scenarios
    if (generateBtn.dataset.bound === 'true') return;
    generateBtn.dataset.bound = 'true';

    generateBtn.addEventListener('click', () => {
        generateSociosPdfFromDashboard();
    });

    // Recompute recommendation on changes (only exists in dedicated pdf view)
    const orientationEl = document.getElementById('pdf-orientation');
    const recoEl = document.getElementById('pdf-orientation-reco');
    const colEls = getPdfColumnCheckboxEls();
    const updateReco = () => {
        const { recommended } = computePdfOrientationRecommendation();
        if (recoEl) {
            const label = recommended === 'landscape' ? 'Horizontal' : 'Vertical';
            recoEl.textContent = `Recomendación: ${label}`;
        }

        // Keep preview in sync (only in pdf view)
        schedulePdfPreviewRefresh();
    };
    if (orientationEl) orientationEl.addEventListener('change', updateReco);
    colEls.forEach(el => el.addEventListener('change', updateReco));
    updateReco();
}

function getPrimaryRgb() {
    // --primary-color: #0230B9
    return { r: 2, g: 48, b: 185 };
}

function safeSocioDesdeYear(socio) {
    const y = socio?.socio_desde;
    const n = Number(y);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    return null;
}

function extractLogoDataUrlFromBlob(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
    });
}

async function loadImageAsPngDataUrl(url) {
    // Best-effort: try fetch -> canvas -> png dataURL. Fallback to raw dataURL if already image/png.
    try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) return '';
        const blob = await res.blob();

        // Try to render blob into canvas and export png (jsPDF doesn't support webp reliably)
        const blobUrl = URL.createObjectURL(blob);
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const loaded = await new Promise((resolve) => {
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                img.src = blobUrl;
            });

            if (!loaded) {
                // Fallback to base64 of blob; may still work if plugin supports the format.
                return await extractLogoDataUrlFromBlob(blob);
            }

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/png');
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    } catch (_) {
        return '';
    }
}

async function fetchSociosForReport() {
    const client = getSupabaseClient();
    const { data, error } = await client
        .from('unoric_socios')
        .select('cedula, socio, estado, celular, correo, socio_desde')
        .order('socio', { ascending: true });
    if (error) throw error;
    return data || [];
}

let pdfSociosReportCache = { ts: 0, data: null }; // in-session cache

async function fetchSociosForReportCached() {
    const now = Date.now();
    if (pdfSociosReportCache.data && (now - pdfSociosReportCache.ts) < (1000 * 60 * 5)) {
        return pdfSociosReportCache.data;
    }
    const data = await fetchSociosForReport();
    pdfSociosReportCache = { ts: now, data };
    return data;
}

async function getAllLotesForReport() {
    const cached = readLotesCache();
    if (cached && Array.isArray(cached)) return cached;
    const client = getSupabaseClient();
    const { data, error } = await client.from('unoric_lotes').select('*');
    if (error) throw error;
    writeLotesCache(data || []);
    return data || [];
}

function getSocioCedulaFromLote(lote) {
    if (!lote || typeof lote !== 'object') return null;
    const candidates = ['socio', 'idsocio', 'id_socio', 'cedula_socio', 'cedula'];
    for (const k of candidates) {
        const v = lote[k];
        if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return null;
}

function buildLotesBySocioMap(lotes) {
    const map = new Map();
    (lotes || []).forEach(l => {
        const cedula = getSocioCedulaFromLote(l);
        if (!cedula) return;
        if (!map.has(cedula)) map.set(cedula, []);
        map.get(cedula).push(l);
    });
    return map;
}

async function fetchPendientesPorSocios(cedulas) {
    const client = getSupabaseClient();
    const unique = Array.from(new Set((cedulas || []).map(c => String(c).trim()).filter(Boolean)));
    if (unique.length === 0) return new Map();

    async function queryView() {
        // Dividir en fragmentos de 100 para evitar URL demasiado larga (Error 400/414)
        const chunks = [];
        for (let i = 0; i < unique.length; i += 100) {
            chunks.push(unique.slice(i, i + 100));
        }

        let allData = [];
        for (const chunk of chunks) {
            const { data, error } = await client
                .from('vw_pagos_por_socio')
                .select('cedula_socio, monto_esperado, monto_abonado, estado_calculado, estado')
                .in('cedula_socio', chunk);
            
            if (error) throw error;
            if (data) allData = allData.concat(data);
        }
        return allData;
    }

    async function queryBase() {
        const chunks = [];
        for (let i = 0; i < unique.length; i += 100) {
            chunks.push(unique.slice(i, i + 100));
        }

        let allData = [];
        for (const chunk of chunks) {
            const { data, error } = await client
                .from('unoric_pagos')
                .select('cedula_socio, monto_esperado, estado')
                .in('cedula_socio', chunk);
            
            if (error) throw error;
            if (data) allData = allData.concat(data);
        }
        
        return allData.map(r => ({
            cedula_socio: r.cedula_socio,
            monto_esperado: r.monto_esperado,
            monto_abonado: 0,
            estado_calculado: null,
            estado: r.estado
        }));
    }

    let rows = [];
    try {
        rows = await queryView();
    } catch (e) {
        console.warn('Fallback to queryBase due to view error:', e);
        rows = await queryBase();
    }

    const pendingMap = new Map();
    rows.forEach(r => {
        const cedula = String(r.cedula_socio || '').trim();
        if (!cedula) return;
        const estado = normalizePagoEstado(r.estado_calculado || r.estado) || 'PENDIENTE';
        if (estado === 'PAGADO') return;

        const esperado = Number(r.monto_esperado || 0);
        const abonado = Number(r.monto_abonado || 0);
        const pendiente = Math.max(0, esperado - abonado);
        if (!Number.isFinite(pendiente) || pendiente <= 0) return;
        pendingMap.set(cedula, (pendingMap.get(cedula) || 0) + pendiente);
    });

    return pendingMap;
}

function setDashPdfMessage(message, type) {
    const el = document.getElementById('dash-pdf-msg');
    setInlineMessage(el, message, type);
}

function getPdfColumnCheckboxEls() {
    const ids = [
        'pdf-col-cedula',
        'pdf-col-socio',
        'pdf-col-estado',
        'pdf-col-socio_desde',
        'pdf-col-lotes',
        'pdf-col-etapas',
        'pdf-col-pendiente'
    ];
    const base = ids.map(id => document.getElementById(id)).filter(Boolean);
    const custom = Array.from(document.querySelectorAll('[data-pdf-custom-col="true"]'));
    return base.concat(custom);
}

function getSelectedPdfColumns() {
    // Defaults (if UI not present)
    const defaults = ['cedula', 'socio', 'estado', 'socio_desde', 'lotes', 'etapas', 'pendiente'];

    const map = {
        'pdf-col-cedula': 'cedula',
        'pdf-col-socio': 'socio',
        'pdf-col-estado': 'estado',
        'pdf-col-socio_desde': 'socio_desde',
        'pdf-col-lotes': 'lotes',
        'pdf-col-etapas': 'etapas',
        'pdf-col-pendiente': 'pendiente'
    };

    const baseEls = Object.keys(map)
        .map(id => ({ id, el: document.getElementById(id) }))
        .filter(x => !!x.el);

    const customEls = Array.from(document.querySelectorAll('[data-pdf-custom-col="true"]'))
        .map(el => ({ id: el.id, el }));

    if (baseEls.length === 0 && customEls.length === 0) return defaults;

    const selected = baseEls
        .filter(x => !!x.el.checked)
        .map(x => map[x.id])
        .concat(customEls.filter(x => x.el.checked).map(x => `custom:${x.id}`));

    // Never allow empty selection
    return selected.length ? selected : defaults;
}

function computePdfOrientationRecommendation() {
    const selectedCols = getSelectedPdfColumns();
    // Heuristic: lots of columns OR includes both lotes+pendiente tends to need landscape.
    const manyColumns = selectedCols.length >= 6;
    const heavy = selectedCols.includes('socio') && (selectedCols.includes('lotes') || selectedCols.includes('pendiente'));
    const recommended = (manyColumns || heavy) ? 'landscape' : 'portrait';
    return { recommended, selectedCols };
}

let pdfCustomColumnsState = []; // [{ id, field, label, enabled }]
let pdfPreviewDebounceTimer = null;
let pdfPreviewRunId = 0;

function schedulePdfPreviewRefresh(immediate = false) {
    const wrap = document.getElementById('pdf-preview-wrap');
    if (!wrap) return; // only in pdf view

    if (pdfPreviewDebounceTimer) {
        clearTimeout(pdfPreviewDebounceTimer);
        pdfPreviewDebounceTimer = null;
    }

    if (immediate) {
        refreshPdfPreview();
        return;
    }

    pdfPreviewDebounceTimer = setTimeout(() => {
        refreshPdfPreview();
    }, 250);
}

function initPdfCustomColumnsUi() {
    const container = document.getElementById('pdf-custom-cols');
    const addBtn = document.getElementById('pdf-custom-add');
    const fieldEl = document.getElementById('pdf-custom-field');
    const labelEl = document.getElementById('pdf-custom-label');
    const msgEl = document.getElementById('pdf-custom-msg');
    if (!container || !addBtn || !fieldEl || !labelEl) return;

    if (addBtn.dataset.bound === 'true') return;
    addBtn.dataset.bound = 'true';

    function showMsg(message, type) {
        setInlineMessage(msgEl, message, type);
    }

    function render() {
        if (!pdfCustomColumnsState.length) {
            container.innerHTML = '<div class="helper-text">No hay columnas personalizadas.</div>';
            return;
        }

        container.innerHTML = pdfCustomColumnsState.map(c => {
            const safeLabel = String(c.label || '').replace(/"/g, '&quot;');
            return `
              <label class="check-inline">
                <input data-pdf-custom-col="true" id="${c.id}" type="checkbox" ${c.enabled ? 'checked' : ''} />
                <span>${safeLabel}</span>
              </label>
              <button class="btn btn-secondary btn-sm" type="button" data-pdf-custom-remove="${c.id}" style="width:auto; padding:0.4rem 0.75rem;">
                Quitar
              </button>
            `;
        }).join('');

        // Bind checkbox changes
        container.querySelectorAll('input[data-pdf-custom-col="true"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = cb.id;
                const idx = pdfCustomColumnsState.findIndex(x => x.id === id);
                if (idx >= 0) pdfCustomColumnsState[idx].enabled = !!cb.checked;

                // Update recommendation text if present
                const recoEl = document.getElementById('pdf-orientation-reco');
                if (recoEl) {
                    const { recommended } = computePdfOrientationRecommendation();
                    recoEl.textContent = `Recomendación: ${recommended === 'landscape' ? 'Horizontal' : 'Vertical'}`;
                }

                schedulePdfPreviewRefresh();
            });
        });

        // Bind remove
        container.querySelectorAll('button[data-pdf-custom-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-pdf-custom-remove');
                pdfCustomColumnsState = pdfCustomColumnsState.filter(x => x.id !== id);
                render();
                showMsg('Columna eliminada.', 'success');
                schedulePdfPreviewRefresh();
            });
        });
    }

    addBtn.addEventListener('click', () => {
        const field = String(fieldEl.value || '').trim();
        const label = String(labelEl.value || '').trim() || fieldEl.options[fieldEl.selectedIndex]?.text || field;

        if (!field) {
            showMsg('Selecciona un campo.', 'error');
            return;
        }
        if (pdfCustomColumnsState.length >= 6) {
            showMsg('Máximo 6 columnas personalizadas.', 'error');
            return;
        }

        const id = `pdf-custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        pdfCustomColumnsState.push({ id, field, label, enabled: true });
        labelEl.value = '';
        render();
        showMsg('Columna agregada.', 'success');

        // New checkbox created; ensure preview updates
        schedulePdfPreviewRefresh(true);
    });

    render();
}

function initPdfPreviewUi() {
    const wrap = document.getElementById('pdf-preview-wrap');
    if (!wrap) return;
    if (wrap.dataset.bound === 'true') return;
    wrap.dataset.bound = 'true';

    const bind = (id, eventName) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener(eventName, () => schedulePdfPreviewRefresh());
    };

    // Filters
    bind('dash-pdf-socios-formato', 'change');
    bind('dash-pdf-socios-etapa', 'change');
    bind('dash-pdf-socios-lote', 'input');
    bind('dash-pdf-socios-desde', 'input');
    bind('dash-pdf-socios-hasta', 'input');
    bind('dash-pdf-socios-solo-activos', 'change');
    bind('dash-pdf-socios-solo-con-lotes', 'change');
    bind('dash-pdf-socios-solo-pendientes', 'change');

    // Header + orientation
    bind('pdf-header-title', 'input');
    bind('pdf-header-subtitle', 'input');
    bind('pdf-orientation', 'change');

    // Column toggles (base)
    getPdfColumnCheckboxEls().forEach(cb => {
        cb.addEventListener('change', () => schedulePdfPreviewRefresh());
    });
}

function getSociosReportFiltersFromUi() {
    const formatoEl = document.getElementById('dash-pdf-socios-formato');
    const etapaEl = document.getElementById('dash-pdf-socios-etapa');
    const loteEl = document.getElementById('dash-pdf-socios-lote');
    const desdeEl = document.getElementById('dash-pdf-socios-desde');
    const hastaEl = document.getElementById('dash-pdf-socios-hasta');
    const soloActivosEl = document.getElementById('dash-pdf-socios-solo-activos');
    const soloConLotesEl = document.getElementById('dash-pdf-socios-solo-con-lotes');
    const soloPendientesEl = document.getElementById('dash-pdf-socios-solo-pendientes');

    return {
        formato: String(formatoEl?.value || 'general'),
        etapa: String(etapaEl?.value || 'all'),
        loteTerm: String(loteEl?.value || '').trim(),
        yearDesde: desdeEl?.value ? Number(String(desdeEl.value).trim()) : null,
        yearHasta: hastaEl?.value ? Number(String(hastaEl.value).trim()) : null,
        soloActivos: !!soloActivosEl?.checked,
        soloConLotes: !!soloConLotesEl?.checked,
        soloPendientes: !!soloPendientesEl?.checked
    };
}

async function computeSociosReportList(filters, needPendientes) {
    const [socios, lotes] = await Promise.all([
        fetchSociosForReportCached(),
        getAllLotesForReport()
    ]);
    const lotesBySocio = buildLotesBySocioMap(lotes);

    let list = (socios || []).map(s => {
        const cedula = String(s.cedula || '').trim();
        const socioLotes = cedula ? (lotesBySocio.get(cedula) || []) : [];
        const etapas = Array.from(new Set(socioLotes.map(l => Number(l.etapa)).filter(n => Number.isFinite(n)))).sort();
        return {
            ...s,
            cedula,
            _lotes: socioLotes,
            _etapas: etapas
        };
    });

    if (filters.soloActivos) list = list.filter(s => isSocioActivoValue(s.estado));
    if (filters.soloConLotes) list = list.filter(s => (s._lotes || []).length > 0);
    if (filters.etapa !== 'all') {
        const etapaNum = Number(filters.etapa);
        list = list.filter(s => (s._lotes || []).some(l => Number(l.etapa) === etapaNum));
    }
    if (filters.loteTerm) {
        const needle = normalizeText(filters.loteTerm);
        list = list.filter(s => (s._lotes || []).some(l => normalizeText(l.lote).includes(needle)));
    }
    if (Number.isFinite(filters.yearDesde)) {
        list = list.filter(s => {
            const ySocio = safeSocioDesdeYear(s);
            return ySocio != null && ySocio >= filters.yearDesde;
        });
    }
    if (Number.isFinite(filters.yearHasta)) {
        list = list.filter(s => {
            const ySocio = safeSocioDesdeYear(s);
            return ySocio != null && ySocio <= filters.yearHasta;
        });
    }

    let pendientesMap = new Map();
    if (needPendientes) {
        pendientesMap = await fetchPendientesPorSocios(list.map(s => s.cedula));
        if (filters.soloPendientes) {
            list = list.filter(s => (pendientesMap.get(s.cedula) || 0) > 0.01);
        }
    }

    return { list, pendientesMap };
}

function getCustomColumnsDefinitions(pendientesMap) {
    return (pdfCustomColumnsState || []).map(c => {
        const key = `custom:${c.id}`;
        const base = {
            key,
            label: String(c.label || c.field || 'Columna'),
            align: 'left',
            cell: (s) => ''
        };

        // Template columns (intentionally blank for printing/filling by hand)
        if (c.field === 'blank_text') {
            base.cell = () => '';
            return base;
        }
        if (c.field === 'blank_check') {
            // Use ASCII so it renders reliably in jsPDF (default fonts) and in any page encoding.
            base.cell = () => '[  ]';
            return base;
        }

        if (c.field === 'celular') {
            base.cell = (s) => String(s.celular || '—');
        } else if (c.field === 'correo') {
            base.cell = (s) => String(s.correo || '—');
        } else if (c.field === 'num_lotes') {
            base.cell = (s) => String((s._lotes || []).length);
            base.align = 'right';
        }
        // If they add a field that implies pendientes, we can extend later.
        return base;
    });
}

function getPdfHeaderFromUi() {
    const titleEl = document.getElementById('pdf-header-title');
    const subtitleEl = document.getElementById('pdf-header-subtitle');
    const title = String(titleEl?.value || '').trim() || "UNORIC R.Q.E - '4 DE JULIO'";
    const subtitle = String(subtitleEl?.value || '').trim();
    return { title, subtitle };
}

async function refreshPdfPreview() {
    const wrap = document.getElementById('pdf-preview-wrap');
    const headEl = document.getElementById('pdf-preview-head');
    const bodyEl = document.getElementById('pdf-preview-body');
    const paperEl = document.getElementById('pdf-preview-paper');
    const titleEl = document.getElementById('pdf-preview-title');
    const subtitleEl = document.getElementById('pdf-preview-subtitle');
    const dateEl = document.getElementById('pdf-preview-date');
    if (!wrap || !headEl || !bodyEl) return;

    const runId = ++pdfPreviewRunId;

    try {
        const filters = getSociosReportFiltersFromUi();
        const selectedCols = getSelectedPdfColumns();

        // Apply orientation to the preview "paper" (auto => recommended)
        const orientationEl = document.getElementById('pdf-orientation');
        const orientationChoice = orientationEl ? String(orientationEl.value || 'auto') : 'auto';
        const { recommended } = computePdfOrientationRecommendation();
        const effectiveOrientation = orientationChoice === 'auto' ? recommended : (orientationChoice === 'landscape' ? 'landscape' : 'portrait');
        if (paperEl) paperEl.setAttribute('data-orientation', effectiveOrientation);

        // Header inside preview (no logo)
        const { title: pdfTitle, subtitle: pdfSubtitle } = getPdfHeaderFromUi();
        if (titleEl) titleEl.textContent = pdfTitle;
        if (subtitleEl) {
            if (pdfSubtitle) {
                subtitleEl.textContent = pdfSubtitle;
                subtitleEl.style.display = '';
            } else {
                subtitleEl.textContent = '';
                subtitleEl.style.display = 'none';
            }
        }

        if (dateEl) {
            const now = new Date();
            const genDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
            dateEl.textContent = `Generado: ${genDate}`;
        }

        const needPendientes = selectedCols.includes('pendiente') || filters.soloPendientes;
        const { list, pendientesMap } = await computeSociosReportList(filters, needPendientes);

        // If a newer run started, ignore stale render
        if (runId !== pdfPreviewRunId) return;

            const baseColumns = [
                { key: 'cedula', label: 'Cédula', align: 'left', cell: (s) => s.cedula },
                { key: 'socio', label: 'Socio', align: 'left', cell: (s) => s.socio || '' },
                { key: 'estado', label: 'Estado', align: 'left', cell: (s) => (isSocioActivoValue(s.estado) ? 'ACTIVO' : 'RETIRADO') },
                { key: 'socio_desde', label: 'Socio desde', align: 'left', cell: (s) => (safeSocioDesdeYear(s) != null ? String(safeSocioDesdeYear(s)) : '—') },
                { key: 'lotes', label: 'Lotes', align: 'left', cell: (s) => ((s._lotes || []).map(l => `L${l.lote || ''}`).filter(Boolean).slice(0, 6).join(', ') || '—') },
                { key: 'etapas', label: 'Etapas', align: 'left', cell: (s) => ((s._etapas || []).length ? s._etapas.map(e => `E${e}`).join(', ') : '—') },
                { key: 'pendiente', label: 'Pendiente', align: 'right', cell: (s) => {
                    const p = pendientesMap.get(s.cedula);
                    return p != null ? `$${formatMoney(p)}` : '—';
                }}
            ];
            const customColumns = getCustomColumnsDefinitions(pendientesMap);
            const allCols = baseColumns.concat(customColumns);
            const selectedColumns = allCols.filter(c => selectedCols.includes(c.key));

        const sample = (list || []).slice(0, 3);
        headEl.innerHTML = selectedColumns.map(c => `<th>${c.label}</th>`).join('');
        bodyEl.innerHTML = sample.map(row => {
            const tds = selectedColumns.map(c => {
                const val = c.cell(row);
                const style = c.align === 'right' ? ' style="text-align:right;"' : '';
                return `<td${style}>${String(val ?? '')}</td>`;
            }).join('');
            return `<tr>${tds}</tr>`;
        }).join('') || `<tr><td colspan="${selectedColumns.length}" class="text-center p-4">Sin datos para mostrar</td></tr>`;
    } catch (err) {
        console.error(err);
        setDashPdfMessage(`Error en vista previa: ${err.message}`, 'error');
    }
}

async function generateSociosPdfFromDashboard() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        setDashPdfMessage('No se pudo cargar la librería PDF (jsPDF). Revisa conexión o recarga la página.', 'error');
        return;
    }

    const formatoEl = document.getElementById('dash-pdf-socios-formato');
    const etapaEl = document.getElementById('dash-pdf-socios-etapa');
    const loteEl = document.getElementById('dash-pdf-socios-lote');
    const desdeEl = document.getElementById('dash-pdf-socios-desde');
    const hastaEl = document.getElementById('dash-pdf-socios-hasta');
    const soloActivosEl = document.getElementById('dash-pdf-socios-solo-activos');
    const soloConLotesEl = document.getElementById('dash-pdf-socios-solo-con-lotes');
    const soloPendientesEl = document.getElementById('dash-pdf-socios-solo-pendientes');

    if (!formatoEl || !etapaEl || !loteEl || !desdeEl || !hastaEl || !soloActivosEl || !soloConLotesEl || !soloPendientesEl) {
        setDashPdfMessage('No se encontraron los controles del reporte. Recarga el módulo.', 'error');
        return;
    }

    const formato = String(formatoEl.value || 'general');
    const etapa = String(etapaEl.value || 'all');
    const loteTerm = String(loteEl.value || '').trim();
    const yearDesdeRaw = String(desdeEl.value || '').trim();
    const yearHastaRaw = String(hastaEl.value || '').trim();
    const yearDesde = yearDesdeRaw ? Number(yearDesdeRaw) : null;
    const yearHasta = yearHastaRaw ? Number(yearHastaRaw) : null;
    const soloActivos = !!soloActivosEl.checked;
    const soloConLotes = !!soloConLotesEl.checked;
    const soloPendientes = !!soloPendientesEl.checked;

    // Orientation + columns (only present in pdf view)
    const orientationEl = document.getElementById('pdf-orientation');
    const orientationChoice = orientationEl ? String(orientationEl.value || 'auto') : 'auto';
    const { recommended, selectedCols } = computePdfOrientationRecommendation();
    const effectiveOrientation = orientationChoice === 'auto' ? recommended : (orientationChoice === 'landscape' ? 'landscape' : 'portrait');

    await withLoader('Generando PDF...', async () => {
        try {
            setDashPdfMessage('', '');

            const filters = {
                formato,
                etapa,
                loteTerm,
                yearDesde,
                yearHasta,
                soloActivos,
                soloConLotes,
                soloPendientes
            };

            const needPendientes = selectedCols.includes('pendiente') || soloPendientes;
            const { list, pendientesMap } = await computeSociosReportList(filters, needPendientes);

            if (list.length === 0) {
                setDashPdfMessage('No hay socios que coincidan con los filtros seleccionados.', 'error');
                return;
            }

            // PDF generation
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: effectiveOrientation });
            const pageWidth = doc.internal.pageSize.getWidth();
            const marginX = 40;

            const primary = getPrimaryRgb();
            const now = new Date();
            const genDate = formatDateLong(now);

            const { title: pdfTitle, subtitle: pdfSubtitle } = getPdfHeaderFromUi();

            // Header bar
            doc.setFillColor(primary.r, primary.g, primary.b);
            doc.rect(0, 0, pageWidth, 78, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.text(pdfTitle, marginX, 34);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            if (pdfSubtitle) {
                doc.text(pdfSubtitle, marginX, 52);
                doc.text(`Generado: ${genDate}`, marginX, 66);
            } else {
                doc.text(`Generado: ${genDate}`, marginX, 54);
            }

            // Logo (best effort)
            const logoDataUrl = await loadImageAsPngDataUrl(DASH_PDF_LOGO_URL);
            if (logoDataUrl) {
                try {
                    const logoSize = 44;
                    doc.addImage(logoDataUrl, 'PNG', pageWidth - marginX - logoSize, 18, logoSize, logoSize);
                } catch (_) {
                    // ignore logo failures
                }
            }

            // Filters summary
            doc.setTextColor(26, 26, 46);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('Criterios', marginX, 110);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            const crit = [
                `Formato: ${formato === 'por_etapa' ? 'Por etapas' : 'Listado general'}`,
                `Etapa: ${etapa === 'all' ? 'Todas' : `Etapa ${etapa}`}`,
                `Lote: ${loteTerm ? loteTerm : '—'}`,
                `Año unión: ${Number.isFinite(yearDesde) ? yearDesde : '—'} a ${Number.isFinite(yearHasta) ? yearHasta : '—'}`,
                `Solo activos: ${soloActivos ? 'Sí' : 'No'} | Solo con lotes: ${soloConLotes ? 'Sí' : 'No'} | Solo pendientes: ${soloPendientes ? 'Sí' : 'No'}`
            ];
            let y = 128;
            crit.forEach(line => {
                doc.text(line, marginX, y);
                y += 14;
            });

            // Summary
            const total = list.length;
            const activos = list.filter(s => isSocioActivoValue(s.estado)).length;
            const conLotes = list.filter(s => (s._lotes || []).length > 0).length;
            const conPendiente = soloPendientes ? total : 0;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('Resumen', marginX, y + 12);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text(`Total: ${total} | Activos: ${activos} | Con lotes: ${conLotes}${soloPendientes ? ` | Con saldo pendiente: ${conPendiente}` : ''}`, marginX, y + 30);

            const startYBase = y + 54;

            const hasAutoTable = typeof doc.autoTable === 'function';
            if (!hasAutoTable) {
                setDashPdfMessage('No se pudo cargar autoTable para tablas. Revisa conexión o recarga la página.', 'error');
                return;
            }

            const columns = [
                {
                    key: 'cedula',
                    label: 'Cédula',
                    align: 'left',
                    cell: (s) => s.cedula
                },
                {
                    key: 'socio',
                    label: 'Socio',
                    align: 'left',
                    cell: (s) => s.socio || ''
                },
                {
                    key: 'estado',
                    label: 'Estado',
                    align: 'left',
                    cell: (s) => (isSocioActivoValue(s.estado) ? 'ACTIVO' : 'RETIRADO')
                },
                {
                    key: 'socio_desde',
                    label: 'Socio desde',
                    align: 'left',
                    cell: (s) => {
                        const ySocio = safeSocioDesdeYear(s);
                        return ySocio != null ? String(ySocio) : '—';
                    }
                },
                {
                    key: 'lotes',
                    label: 'Lotes',
                    align: 'left',
                    cell: (s) => {
                        const lotesTxt = (s._lotes || [])
                            .map(l => `L${l.lote || ''}`)
                            .filter(Boolean)
                            .slice(0, 6)
                            .join(', ');
                        return lotesTxt || '—';
                    }
                },
                {
                    key: 'etapas',
                    label: 'Etapas',
                    align: 'left',
                    cell: (s) => ((s._etapas || []).length ? s._etapas.map(e => `E${e}`).join(', ') : '—')
                },
                {
                    key: 'pendiente',
                    label: 'Pendiente',
                    align: 'right',
                    cell: (s) => {
                        const pendiente = pendientesMap.get(s.cedula);
                        return pendiente != null ? `$${formatMoney(pendiente)}` : '—';
                    }
                }
            ].concat(getCustomColumnsDefinitions(pendientesMap));

            const selectedColumns = columns.filter(c => selectedCols.includes(c.key));
            const headRow = selectedColumns.map(c => c.label);

            function buildRows(items) {
                return items.map(s => selectedColumns.map(c => c.cell(s)));
            }

            function buildColumnStyles() {
                // Widths tuned for portrait/landscape. AutoTable will still wrap if needed.
                const portraitWidths = {
                    cedula: 80,
                    socio: 200,
                    estado: 70,
                    socio_desde: 70,
                    lotes: 95,
                    etapas: 60,
                    pendiente: 70
                };
                const landscapeWidths = {
                    cedula: 85,
                    socio: 260,
                    estado: 75,
                    socio_desde: 75,
                    lotes: 120,
                    etapas: 70,
                    pendiente: 80
                };
                const widths = effectiveOrientation === 'landscape' ? landscapeWidths : portraitWidths;

                const styles = {};
                selectedColumns.forEach((col, idx) => {
                    const base = { cellWidth: widths[col.key] };
                    if (col.align === 'right') base.halign = 'right';
                    styles[idx] = base;
                });
                return styles;
            }

            function addTable(title, items, startY) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(primary.r, primary.g, primary.b);
                doc.text(title, marginX, startY - 10);
                doc.setTextColor(26, 26, 46);

                doc.autoTable({
                    startY,
                    head: [headRow],
                    body: buildRows(items),
                    styles: {
                        font: 'helvetica',
                        fontSize: 9,
                        cellPadding: 6,
                        lineColor: [226, 232, 240],
                        lineWidth: 0.6
                    },
                    headStyles: {
                        fillColor: [primary.r, primary.g, primary.b],
                        textColor: [255, 255, 255]
                    },
                    alternateRowStyles: {
                        fillColor: [248, 250, 252]
                    },
                    columnStyles: buildColumnStyles(),
                    margin: { left: marginX, right: marginX }
                });
                // eslint-disable-next-line no-undef
                return doc.lastAutoTable?.finalY || (startY + 40);
            }

            let cursorY = startYBase;

            if (formato === 'por_etapa') {
                const groups = new Map();
                list.forEach(s => {
                    const etapasArr = (s._etapas || []);
                    if (etapasArr.length === 0) {
                        const key = 'SIN_LOTES';
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key).push(s);
                        return;
                    }
                    etapasArr.forEach(e => {
                        const key = `ETAPA_${e}`;
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key).push(s);
                    });
                });

                const order = ['ETAPA_1', 'ETAPA_2', 'ETAPA_3', 'SIN_LOTES'];
                order.forEach(key => {
                    const items = groups.get(key);
                    if (!items || items.length === 0) return;
                    const title = key === 'SIN_LOTES' ? 'Sin lotes asignados' : `Etapa ${key.split('_')[1]}`;
                    cursorY = addTable(`${title} (${items.length})`, items, cursorY + 22);
                });
            } else {
                cursorY = addTable(`Listado (${list.length})`, list, cursorY + 22);
            }

            // Footer
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                const h = doc.internal.pageSize.getHeight();
                doc.setDrawColor(226, 232, 240);
                doc.line(marginX, h - 36, pageWidth - marginX, h - 36);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(100, 116, 139);
                doc.text(`UNORIC - Asociación 4 de Julio`, marginX, h - 20);
                doc.text(`Página ${i} de ${pageCount}`, pageWidth - marginX, h - 20, { align: 'right' });
            }

            const filename = `reporte_socios_${todayISODate()}.pdf`;
            doc.save(filename);
            setDashPdfMessage(`PDF generado: ${filename}`, 'success');
        } catch (err) {
            console.error(err);
            setDashPdfMessage(`Error generando PDF: ${err.message}`, 'error');
        }
    });
}

function setInlineMessage(el, message, type) {
    if (!el) return;
    if (!message) {
        el.style.display = 'none';
        el.textContent = '';
        el.classList.remove('success', 'error');
        return;
    }
    el.style.display = 'block';
    el.textContent = message;
    el.classList.remove('success', 'error');
    if (type === 'success') el.classList.add('success');
    if (type === 'error') el.classList.add('error');
}

// isSocioActivoValue y normalizePagoEstado movidas arriba (antes del dashboard)

// ==========================================
// SOCIOS CACHE (para búsquedas locales)
// ==========================================
const SOCIOS_CACHE_KEY = 'unoric_socios_cache_v1';
const SOCIOS_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 días

function writeSociosQuickCache(socios) {
    try {
        const payload = {
            savedAt: Date.now(),
            socios: (socios || []).map(s => ({
                cedula: s.cedula,
                socio: s.socio,
                estado: s.estado,
                socio_desde: s.socio_desde
            }))
        };
        localStorage.setItem(SOCIOS_CACHE_KEY, JSON.stringify(payload));
    } catch (_) {
        // ignore
    }
}

function readSociosQuickCache() {
    try {
        const raw = localStorage.getItem(SOCIOS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.socios || !Array.isArray(parsed.socios)) return null;
        if (parsed.savedAt && (Date.now() - parsed.savedAt) > SOCIOS_CACHE_MAX_AGE_MS) return null;
        return parsed.socios;
    } catch (_) {
        return null;
    }
}

function getSociosQuickList() {
    // Prefer in-memory cache from Socios module
    if (Array.isArray(allSocios) && allSocios.length > 0) {
        return allSocios.map(s => ({ 
            cedula: s.cedula, 
            socio: s.socio, 
            estado: s.estado,
            socio_desde: s.socio_desde 
        }));
    }
    // Fallback: localStorage
    const cached = readSociosQuickCache();
    if (cached && cached.length) return cached;
    return [];
}

function looksLikeCedula(text) {
    const t = String(text || '').trim();
    return /^\d{6,20}$/.test(t);
}

function normalizeText(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function parseISODateParts(dateISO) {
    // Avoid timezone shifts from new Date('YYYY-MM-DD')
    if (!dateISO) return null;
    const s = String(dateISO).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { year, month, day };
}

function lastDayOfMonth(year, month) {
    // month: 1-12
    return new Date(year, month, 0).getDate();
}

function formatMonthLabel(dateISO) {
    const parts = parseISODateParts(dateISO);
    if (!parts) return null;
    const { year, month } = parts;
    return { year, month, key: `${year}-${String(month).padStart(2, '0')}` };
}

async function fetchPagosBasePorSocio(cedula, tipoIds) {
    const client = getSupabaseClient();
    let q = client
        .from('unoric_pagos')
        .select('id, cedula_socio, tipo_pago_id, descripcion, monto_esperado, periodo_desde, periodo_hasta, estado, created_at')
        .eq('cedula_socio', cedula);

    if (Array.isArray(tipoIds) && tipoIds.length > 0) {
        q = q.in('tipo_pago_id', tipoIds);
    }

    const { data, error } = await q.order('periodo_desde', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return data || [];
}

// ==========================================
// SOCIO MODAL (ESTADO)
// ==========================================
let socioModalCurrentCedula = null;

function openSocioModal(cedula) {
    if (!socioModal) return;
    const socio = allSocios.find(s => s.cedula === cedula);
    if (!socio) return;

    socioModalCurrentCedula = socio.cedula;
    socioModalCedula.value = socio.cedula;
    socioModalNombre.value = socio.socio || '';
    socioModalActivo.checked = isSocioActivoValue(socio.estado);
    setInlineMessage(socioModalMsg, '', '');

    // Only admin should be able to change status (RLS also enforces)
    const canEdit = isAdmin();
    socioModalActivo.disabled = !canEdit;
    socioModalGuardar.disabled = !canEdit;
    if (!canEdit) {
        setInlineMessage(socioModalMsg, 'Acceso restringido: solo ADMIN puede cambiar el estado.', 'error');
    }

    socioModal.classList.remove('hidden');
    socioModal.setAttribute('aria-hidden', 'false');
}

function closeSocioModal() {
    if (!socioModal) return;
    socioModal.classList.add('hidden');
    socioModal.setAttribute('aria-hidden', 'true');
    socioModalCurrentCedula = null;
}

// ==========================================
// SOCIO CREATE MODAL
// ==========================================
function openSocioCreateModal() {
    if (!socioCreateModal) return;

    const canCreate = isAdmin();
    setInlineMessage(socioCreateMsg, '', '');

    // Reset fields
    if (socioCreateCedula) socioCreateCedula.value = '';
    if (socioCreateNombre) socioCreateNombre.value = '';
    if (socioCreateCelular) socioCreateCelular.value = '';
    if (socioCreateCorreo) socioCreateCorreo.value = '';
    if (socioCreateDesde) socioCreateDesde.value = '';
    if (socioCreateActivo) socioCreateActivo.checked = true;

    // Gate by role (UI); RLS should also enforce.
    [socioCreateCedula, socioCreateNombre, socioCreateCelular, socioCreateCorreo, socioCreateDesde, socioCreateActivo, socioCreateGuardar]
        .filter(Boolean)
        .forEach(el => { el.disabled = !canCreate; });

    if (!canCreate) {
        setInlineMessage(socioCreateMsg, 'Acceso restringido: solo ADMIN puede crear socios.', 'error');
    }

    socioCreateModal.classList.remove('hidden');
    socioCreateModal.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
        if (socioCreateCedula && !socioCreateCedula.disabled) socioCreateCedula.focus();
    }, 0);
}

function closeSocioCreateModal() {
    if (!socioCreateModal) return;
    socioCreateModal.classList.add('hidden');
    socioCreateModal.setAttribute('aria-hidden', 'true');
}

function looksLikeCedula(value) {
    const v = String(value || '').trim();
    // Ecuador cédula is 10 digits; we keep it simple for now.
    return /^\d{10}$/.test(v);
}

async function saveNewSocio() {
    if (!isAdmin()) return;
    if (!socioCreateCedula || !socioCreateNombre) return;

    const cedula = String(socioCreateCedula.value || '').trim();
    const nombre = String(socioCreateNombre.value || '').trim();
    const celular = String(socioCreateCelular?.value || '').trim();
    const correo = String(socioCreateCorreo?.value || '').trim();
    const desdeRaw = String(socioCreateDesde?.value || '').trim();
    const desdeYear = desdeRaw ? Number(desdeRaw) : null;
    const activo = !!socioCreateActivo?.checked;

    if (!cedula) {
        setInlineMessage(socioCreateMsg, 'La cédula es obligatoria.', 'error');
        return;
    }
    if (!looksLikeCedula(cedula)) {
        setInlineMessage(socioCreateMsg, 'La cédula debe tener 10 dígitos.', 'error');
        return;
    }
    if (!nombre) {
        setInlineMessage(socioCreateMsg, 'El nombre es obligatorio.', 'error');
        return;
    }
    if (desdeRaw && !Number.isFinite(desdeYear)) {
        setInlineMessage(socioCreateMsg, 'El año "Socio desde" es inválido.', 'error');
        return;
    }

    await withLoader('Creando socio...', async () => {
        try {
            const client = getSupabaseClient();
            const payload = {
                cedula,
                socio: nombre,
                estado: activo,
                celular: celular || null,
                correo: correo || null,
                socio_desde: Number.isFinite(desdeYear) ? Math.trunc(desdeYear) : null
            };

            const { data, error } = await client
                .from('unoric_socios')
                .insert([payload])
                .select('*')
                .single();
            if (error) throw error;

            // Update local state for Socios module if loaded
            const newSocio = {
                ...(data || payload),
                lotes: [],
                hasLotes: false,
                needsUpdate: false,
                invalidPhone: false,
                invalidEmail: false
            };

            // If socios module has been initialized, update arrays and stats
            if (Array.isArray(allSocios)) {
                allSocios = [newSocio, ...allSocios];
                filteredSocios = [...allSocios];

                // Update stats if elements exist
                const totalSociosEl = document.getElementById('total-socios');
                const sociosConLotesEl = document.getElementById('socios-con-lotes');
                const sociosIncompleteEl = document.getElementById('socios-incomplete');
                if (totalSociosEl) totalSociosEl.textContent = allSocios.length;
                if (sociosConLotesEl) sociosConLotesEl.textContent = allSocios.filter(s => s.hasLotes).length;
                if (sociosIncompleteEl) sociosIncompleteEl.textContent = allSocios.filter(s => s.needsUpdate).length;

                // Refresh table using current filters if present
                const searchInput = document.getElementById('search-socios');
                const filterEtapa = document.getElementById('filter-etapa');
                const filterEstado = document.getElementById('filter-estado');
                if (searchInput && filterEtapa && filterEstado) {
                    filterSocios(searchInput.value, filterEtapa.value, filterEstado.value);
                } else {
                    renderSociosTable(filteredSocios);
                }

                writeSociosQuickCache(allSocios);
            }

            setInlineMessage(socioCreateMsg, 'Socio creado correctamente.', 'success');
            setTimeout(() => closeSocioCreateModal(), 450);
        } catch (err) {
            console.error(err);
            setInlineMessage(socioCreateMsg, `Error creando socio: ${err.message}`, 'error');
        }
    });
}

async function saveSocioEstado() {
    if (!isAdmin()) return;
    if (!socioModalCurrentCedula) return;

    const cedula = socioModalCurrentCedula;
    const nuevoEstado = !!socioModalActivo.checked;

    await withLoader('Guardando socio...', async () => {
        try {
            const client = getSupabaseClient();
            const { error } = await client
                .from('unoric_socios')
                .update({ estado: nuevoEstado })
                .eq('cedula', cedula);
            if (error) throw error;

            // Update local cache
            const idx = allSocios.findIndex(s => s.cedula === cedula);
            if (idx >= 0) allSocios[idx].estado = nuevoEstado;

            setInlineMessage(socioModalMsg, 'Estado actualizado correctamente.', 'success');

            // Re-apply current filters to refresh table
            const searchInput = document.getElementById('search-socios');
            const filterEtapa = document.getElementById('filter-etapa');
            const filterEstado = document.getElementById('filter-estado');
            if (searchInput && filterEtapa && filterEstado) {
                filterSocios(searchInput.value, filterEtapa.value, filterEstado.value);
            } else {
                renderSociosTable(filteredSocios);
            }

            // Auto-close after save
            setTimeout(() => closeSocioModal(), 400);
        } catch (err) {
            console.error(err);
            setInlineMessage(socioModalMsg, `Error guardando: ${err.message}`, 'error');
        }
    });
}

function formatMoney(value) {
    const num = Number(value || 0);
    return num.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISODate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function isPastDate(isoDate) {
    if (!isoDate) return false;
    const input = new Date(`${isoDate}T00:00:00`);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return input < today;
}

async function safeSelectSingle(tableOrView, select, eqCol, eqVal) {
    const client = getSupabaseClient();
    const { data, error } = await client
        .from(tableOrView)
        .select(select)
        .eq(eqCol, eqVal)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function fetchTiposPago() {
    const client = getSupabaseClient();
    const { data, error } = await client
        .from('unoric_tipos_pago')
        .select('*')
        .order('codigo', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function fetchTipoPagoTarifasPorAnio(tipoPagoId) {
    const client = getSupabaseClient();
    const { data, error } = await client
        .from('unoric_tipos_pago_tarifas')
        .select('anio, monto, activo')
        .eq('tipo_pago_id', tipoPagoId)
        .eq('activo', true)
        .order('anio', { ascending: true });
    if (error) throw error;
    const map = new Map();
    (data || []).forEach(r => {
        const y = Number(r.anio);
        const m = Number(r.monto);
        if (Number.isFinite(y) && Number.isFinite(m)) map.set(y, m);
    });
    return map;
}

async function fetchLotesBySocio(cedula) {
    const client = getSupabaseClient();

    // Prefer canonical column name: socio (cedula del socio dueño)
    const tryColumns = ['socio', 'idsocio', 'id_socio'];
    for (const col of tryColumns) {
        const { data, error } = await client
            .from('unoric_lotes')
            .select('id_lote, lote, etapa')
            .eq(col, cedula)
            .order('lote', { ascending: true });
        if (!error) return data || [];
    }
    // If we got here, surface the last error by re-running the canonical query.
    const { data, error } = await client
        .from('unoric_lotes')
        .select('id_lote, lote, etapa')
        .eq('socio', cedula)
        .order('lote', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function fetchPagosPorSocio(cedula) {
    const client = getSupabaseClient();

    // Prefer view with calculated state. Fallback to base table if view not available.
    const { data, error } = await client
        .from('vw_pagos_por_socio')
        .select('*')
        .eq('cedula_socio', cedula)
        .order('created_at', { ascending: false });

    if (!error) return data || [];

    // Fallback: base table without calculated state.
    const { data: pagos, error: pagosError } = await client
        .from('unoric_pagos')
        .select('id, cedula_socio, id_lote, tipo_pago_id, descripcion, monto_esperado, periodo_desde, periodo_hasta, estado, created_at, created_by')
        .eq('cedula_socio', cedula)
        .order('created_at', { ascending: false });
    if (pagosError) throw pagosError;
    return pagos || [];
}

// ==========================================
// SHARED MENSUALIDADES CALCULATION
// ==========================================
// Fallback if no rate is found in unoric_tipos_pago_tarifas
const DEFAULT_MENSUALIDAD_USD_POR_LOTE = 5; 
const MONTHS_ES = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

function monthNameES(month) {
    const m = Number(month);
    if (!m || m < 1 || m > 12) return '';
    return MONTHS_ES[m - 1];
}

function computeFeeForYear(year, tarifasMap, baseMonto) {
    const y = Number(year);
    if (tarifasMap && tarifasMap.has(y)) return tarifasMap.get(y);
    return baseMonto || DEFAULT_MENSUALIDAD_USD_POR_LOTE;
}

function computeAmountForYearItem(item, hastaMes, loteCount) {
    const lc = Number(loteCount || 0);
    const fee = item.feePerLote || DEFAULT_MENSUALIDAD_USD_POR_LOTE;
    const fromMonth = Number(item.paidThroughMonth || 0);
    const toMonth = Number(hastaMes || 0);
    const monthsToPay = Math.max(0, toMonth - fromMonth);
    return monthsToPay * fee * lc;
}

function buildMensualidadItems(pagosBase, loteCount, tarifasMap, baseMonto, socioDesde = null, regularizacion = null) {
    const now = new Date();
    const currentYear = now.getFullYear();
    let minYear = currentYear;

    // Extraer año de socioDesde (puede ser YYYY o YYYY-MM-DD)
    if (socioDesde) {
        const s = String(socioDesde).trim();
        if (s.length >= 4) {
            const y = Number(s.slice(0, 4));
            if (!isNaN(y) && y > 1900 && y <= currentYear) {
                minYear = y;
            }
        }
    }

    const regAnio = Number(regularizacion?.anio || 0);
    const regFechaPartes = parseISODateParts(regularizacion?.fecha);
    const regMes = regFechaPartes?.month || 0;

    const bestByYear = new Map();
    (pagosBase || []).forEach(p => {
        const from = parseISODateParts(p.periodo_desde);
        const to = parseISODateParts(p.periodo_hasta);
        const y = from?.year || to?.year;
        if (!y) return;
        if (y < minYear) minYear = y;

        const hastaISO = String(p.periodo_hasta || '');
        const hastaMonth = to?.month || 0;
        const estado = normalizePagoEstado(p.estado) || 'PENDIENTE';
        const prev = bestByYear.get(y);

        if (!prev || (hastaMonth > prev.hastaMonth)) {
            bestByYear.set(y, {
                id: p.id,
                estado,
                hastaMonth,
                hastaISO,
                monto: p.monto_esperado,
                monto_abonado: p.monto_abonado || 0
            });
        }
    });

    const items = [];
    for (let y = minYear; y <= currentYear; y++) {
        const best = bestByYear.get(y);
        const feePerLote = computeFeeForYear(y, tarifasMap, baseMonto);
        
        let startMonth = best ? best.hastaMonth : 0;
        let isRegularizado = false;

        // Integrar datos de migración/regularización
        if (y < regAnio) {
            startMonth = 12;
            isRegularizado = true;
        } else if (y === regAnio) {
            if (regMes > startMonth) {
                startMonth = regMes;
                isRegularizado = true;
            }
        }
        
        if (startMonth === 12) {
            items.push({
                key: `pagado-${y}`,
                kind: 'pagado',
                year: y,
                detail: isRegularizado ? 'Regularizado (Migración)' : 'Año pagado completo',
                pendienteMonto: 0,
                pendienteDisplay: 'PAGADO',
                feePerLote
            });
        } else {
            const mesesPendientes = 12 - startMonth;
            const montoTotal = mesesPendientes * feePerLote * (loteCount || 0);
            items.push({
                key: `pendiente-${y}`,
                kind: 'pendiente',
                year: y,
                detail: startMonth === 0 ? 'Sin pagos registrados' : (isRegularizado ? `Migrado hasta ${monthNameES(startMonth)}` : `Pagado hasta ${monthNameES(startMonth)}`),
                pendienteMonto: montoTotal,
                feePerLote,
                paidThroughMonth: startMonth,
                existingId: best?.id,
                monto_abonado: best?.monto_abonado || 0
            });
        }
    }
    return items.sort((a, b) => b.year - a.year);
}

// ==========================================
// COBROS MODULE
// ==========================================
let cobrosState = {
    socio: null,
    lotes: [],
    tipos: [],
    pagos: [],
    selectedPago: null,
    socioActivo: true
};

async function initCobrosModule() {
    const cedulaInput = document.getElementById('cobros-cedula');
    const buscarBtn = document.getElementById('cobros-buscar');
    const clearBtn = document.getElementById('cobros-clear');
    const backBtn = document.getElementById('cobros-back-btn');
    const socioInfo = document.getElementById('cobros-socio-info');
    const localResults = document.getElementById('cobros-local-results');
    
    // Dashboard
    const dashboard = document.getElementById('cobros-dashboard');
    const statLotes = document.getElementById('cobros-stat-lotes');
    const statPendiente = document.getElementById('cobros-stat-pendiente');

    // Deudas
    const mensualidadesBody = document.getElementById('cobros-mensualidades-body');
    const otrosBody = document.getElementById('cobros-otros-body');

    // Formulario Pago
    const seleccionInfo = document.getElementById('cobros-seleccion');
    const pagoForm = document.getElementById('cobros-form-pago');
    const fieldHastaMes = document.getElementById('field-hasta-mes');
    const hastaMesSelect = document.getElementById('cobros-hasta-mes');
    const pagoFecha = document.getElementById('cobros-pago-fecha');
    const pagoMonto = document.getElementById('cobros-pago-monto');
    const pagoReferencia = document.getElementById('cobros-pago-referencia');
    const pagoObservaciones = document.getElementById('cobros-pago-observaciones');
    const pagoSubmit = document.getElementById('cobros-registrar');
    const pagoMsg = document.getElementById('cobros-pago-msg');
    const modalRecaudacion = document.getElementById('modal-recaudacion');
    const closeModalRecaudacion = document.getElementById('close-modal-recaudacion');
    const btnCancelarPago = document.getElementById('btn-cancelar-pago');
    const displayTotalPago = document.getElementById('display-total-pago');

    // Admin stuff
    const btnCrearManual = document.getElementById('cobros-btn-crear-manual');
    const modalManual = document.getElementById('modal-cargo-manual');
    const adminSection = document.getElementById('cobros-admin-only');
    const manualUnitario = document.getElementById('manual-unitario');
    const manualTotalPreview = document.getElementById('manual-preview-total');

    if (adminSection && isAdmin()) {
        adminSection.classList.remove('hidden');
    }

    pagoFecha.value = todayISODate();

    let state = {
        socio: null,
        loteCount: 0,
        mensualidadTipoId: null,
        mensualidadTarifas: new Map(),
        mensualidadItems: [],
        otrasObligaciones: [],
        selection: null // { kind: 'mens'|'otro', item: obj }
    };

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            loadView('caja');
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            cedulaInput.value = '';
            localResults.innerHTML = '';
            resetView();
        });
    }

    function renderLocalMatches(matches) {
        if (!matches || matches.length === 0) {
            localResults.innerHTML = '';
            return;
        }
        const top = matches.slice(0, 12);
        localResults.innerHTML = `
            <div class="mt-4" style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.5rem; box-shadow: var(--shadow-sm);">
                <div class="text-muted text-xs font-bold uppercase mb-4 px-1" style="letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-search text-primary" style="font-size: 0.8rem;"></i>
                    Coincidencias encontradas (${matches.length}):
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; width: 100%;">
                    ${top.map(s => {
                        const activo = isSocioActivoValue(s.estado);
                        const desde = s.socio_desde ? `<div class="text-xs text-muted mt-2" style="background: rgba(0,0,0,0.03); padding: 4px 8px; border-radius: 4px; display: inline-block;"><i class="far fa-calendar-alt mr-1"></i> Socio desde: <strong>${s.socio_desde}</strong></div>` : '';
                        return `
                            <button type="button" class="btn btn-secondary btn-sm" style="display:block; text-align: left; background: var(--card-bg); padding: 1.5rem; border: 1px solid var(--border-color); transition: all 0.2s; height: auto; width: 100%; box-shadow: var(--shadow-sm); position: relative; overflow: hidden;" data-cedula="${s.cedula}">
                                <div style="display:flex; justify-content: space-between; align-items: flex-start;">
                                    <div style="flex: 1; padding-right: 12px;">
                                        <div style="font-weight: 800; color: var(--primary-color); line-height: 1.3; font-size: 1rem; text-transform: uppercase; margin-bottom: 4px;">${s.socio || ''}</div>
                                        <div class="text-sm font-medium text-muted" style="display:flex; align-items:center; gap: 6px;">
                                            <i class="fas fa-id-card" style="font-size: 0.8rem; opacity: 0.5;"></i> 
                                            ${s.cedula}
                                        </div>
                                    </div>
                                    ${!activo ? '<span class="badge badge-danger" style="font-size: 0.65rem; padding: 4px 8px; border-radius: 4px;">Retirado</span>' : '<i class="fas fa-chevron-right text-muted" style="font-size: 0.8rem; opacity: 0.5;"></i>'}
                                </div>
                                ${desde}
                                <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: ${activo ? 'var(--primary-color)' : '#ef4444'}; opacity: 0.1;"></div>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        localResults.querySelectorAll('button[data-cedula]').forEach(btn => {
            btn.addEventListener('click', () => {
                cedulaInput.value = btn.getAttribute('data-cedula');
                localResults.innerHTML = '';
                loadSocioAndData();
            });
        });
    }

    cedulaInput.addEventListener('input', () => {
        const query = cedulaInput.value.trim();
        if (query.length < 2) {
            localResults.innerHTML = '';
            return;
        }
        const list = getSociosQuickList();
        const qn = normalizeText(query);
        const matches = list.filter(s => {
            const name = normalizeText(s.socio);
            const ced = normalizeText(s.cedula);
            return name.includes(qn) || ced.includes(qn);
        });
        renderLocalMatches(matches);
    });

    function resetView() {
        if (socioInfo) socioInfo.style.display = 'none';
        if (dashboard) dashboard.style.display = 'none';
        mensualidadesBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Consulta un socio para ver mensualidades</td></tr>';
        otrosBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Consulta un socio para ver cargos</td></tr>';
        resetForm();
    }

    function resetForm() {
        state.selection = null;
        if (modalRecaudacion) modalRecaudacion.classList.add('hidden');
        if (displayTotalPago) displayTotalPago.textContent = '$0.00';
        
        seleccionInfo.innerHTML = '<i class="fas fa-info-circle"></i> Selecciona una deuda arriba para procesar.';
        fieldHastaMes.style.display = 'none';
        pagoMonto.value = '';
        pagoReferencia.value = '';
        pagoObservaciones.value = '';
        setInlineMessage(pagoMsg, '', '');
    }

    if (closeModalRecaudacion) {
        closeModalRecaudacion.addEventListener('click', () => modalRecaudacion.classList.add('hidden'));
    }
    if (btnCancelarPago) {
        btnCancelarPago.addEventListener('click', () => modalRecaudacion.classList.add('hidden'));
    }

    function updateDashboard() {
        if (!dashboard) return;
        dashboard.style.display = 'grid';
        statLotes.textContent = String(state.loteCount || 0);
        const lc = Number(state.loteCount || 0);
        
        const pentMens = (state.mensualidadItems || [])
            .filter(it => it.kind === 'pendiente')
            .reduce((acc, it) => acc + Number(it.pendienteMonto || 0), 0);
            
        const pentOtros = (state.otrasObligaciones || [])
            .reduce((acc, it) => acc + ((Number(it.monto_esperado) * lc) - Number(it.monto_abonado || 0)), 0);

        statPendiente.textContent = `$${formatMoney(pentMens + pentOtros)}`;
    }

    function renderMensualidades() {
        const items = state.mensualidadItems || [];
        if (items.length === 0) {
            mensualidadesBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">No se detectaron mensualidades pendientes.</td></tr>';
            return;
        }

        mensualidadesBody.innerHTML = items.map(it => {
            const isPagado = it.kind === 'pagado';
            const valTxt = `$${formatMoney(it.feePerLote || 0)}`;
            const pendTxt = isPagado ? '$0,00' : `$${formatMoney(it.pendienteMonto)}`;
            const badge = isPagado ? '<span class="badge badge-success">Pagado completo</span>' : `<span class="badge badge-warning">Pendiente</span>`;
            
            return `
                <tr>
                    <td class="font-bold">${it.year}</td>
                    <td>${valTxt}</td>
                    <td class="text-sm">${it.detail} ${it.kind !== 'pagado' ? `(${state.loteCount} lotes)` : ''}</td>
                    <td><strong>${badge}</strong><br/><span class="text-sm">${pendTxt}</span></td>
                    <td>
                        ${!isPagado ? `<button class="btn btn-primary btn-sm btn-action-mens" data-key="${it.key}">Cobrar</button>` : '—'}
                    </td>
                </tr>
            `;
        }).join('');

        mensualidadesBody.querySelectorAll('.btn-action-mens').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-key');
                const item = state.mensualidadItems.find(x => x.key === key);
                selectItem('mens', item);
            });
        });
    }

    function renderOtros() {
        const lotes = Number(state.loteCount || 0);
        // Filtrar solo los que tengan saldo pendiente real (MontoUnitario * Lotes - Abonado > 0)
        const list = (state.otrasObligaciones || []).filter(o => {
            const realTotal = Number(o.monto_esperado) * lotes;
            const abono = Number(o.monto_abonado || 0);
            return (realTotal - abono) > 0.01; // Tolerancia de 1 centavo
        });

        if (list.length === 0) {
            otrosBody.innerHTML = '<tr><td colspan="6" class="text-center p-4">No hay otros cargos pendientes.</td></tr>';
            return;
        }

        otrosBody.innerHTML = list.map(o => {
            const unit = Number(o.monto_esperado);
            const pendiente = (unit * lotes) - Number(o.monto_abonado || 0);
            
            return `
                <tr>
                    <td class="text-xs font-bold">${o.tipo_codigo || 'CARGO'}</td>
                    <td>
                        <span class="font-bold">${o.descripcion}</span><br>
                        <span class="text-xs text-muted">Solicitado: ${o.fecha_solicitud || '—'}</span>
                    </td>
                    <td>$${formatMoney(unit)}</td>
                    <td>${lotes}</td>
                    <td><span class="badge badge-danger">$${formatMoney(pendiente)}</span></td>
                    <td>
                        <button class="btn btn-primary btn-sm btn-action-otro" data-id="${o.id}">Cobrar</button>
                    </td>
                </tr>
            `;
        }).join('');

        otrosBody.querySelectorAll('.btn-action-otro').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const item = state.otrasObligaciones.find(x => x.id === id);
                selectItem('otro', item);
            });
        });
    }

    function selectItem(kind, item) {
        state.selection = { kind, item };
        const lc = Number(state.loteCount || 0);
        setInlineMessage(pagoMsg, '', '');

        if (kind === 'mens') {
            seleccionInfo.innerHTML = `<strong>Año ${item.year}</strong> - ${item.detail}`;
            fieldHastaMes.style.display = 'block';
            
            // Sugerir mes
            const suggestedHasta = (item.year === new Date().getFullYear()) ? (new Date().getMonth() + 1) : 12;
            const alreadyPaid = item.paidThroughMonth || 0;
            hastaMesSelect.value = String(Math.max(suggestedHasta, alreadyPaid + 1));
            actualizarMontoMensualidad();
        } else {
            seleccionInfo.innerHTML = `<strong>Cargo:</strong> ${item.descripcion}`;
            fieldHastaMes.style.display = 'none';
            // Cálculo del saldo real: (Unitario * Lotes) - Abonado
            const unit = Number(item.monto_esperado);
            const pendiente = (unit * lc) - Number(item.monto_abonado || 0);
            const pendStr = Number(pendiente).toFixed(2);
            pagoMonto.value = pendStr;
            if (displayTotalPago) displayTotalPago.textContent = `$${formatMoney(pendiente)}`;
        }
        
        // Abrir modal elegante
        if (modalRecaudacion) modalRecaudacion.classList.remove('hidden');
        
        // Enfocar campo de referencia para agilizar
        setTimeout(() => pagoReferencia?.focus(), 100);
    }

    function actualizarMontoMensualidad() {
        if (!state.selection || state.selection.kind !== 'mens') return;
        const item = state.selection.item;
        const hasta = Number(hastaMesSelect.value);
        const desde = Number(item.paidThroughMonth || 0);
        const meses = Math.max(0, hasta - desde);
        const total = meses * (item.feePerLote || 0) * (state.loteCount || 0);
        const totalStr = Number(total).toFixed(2);
        pagoMonto.value = totalStr;
        if (displayTotalPago) displayTotalPago.textContent = `$${formatMoney(total)}`;
    }

    // Actualizar display al escribir manualmente en el monto
    pagoMonto.addEventListener('input', () => {
        const val = Number(pagoMonto.value || 0);
        if (displayTotalPago) displayTotalPago.textContent = `$${formatMoney(val)}`;
    });

    hastaMesSelect.addEventListener('change', actualizarMontoMensualidad);

    async function loadSocioAndData() {
        const cedula = (cedulaInput.value || '').trim();
        resetView();

        if (!cedula) return;

        await withLoader('Buscando deudas...', async () => {
            try {
                const client = getSupabaseClient();
                
                // 1. Datos del socio y regularización (migración)
                const socio = await safeSelectSingle('unoric_socios', 'cedula, socio, estado, socio_desde', 'cedula', cedula);
                if (!socio) {
                    setInlineMessage(pagoMsg, 'Socio no encontrado.', 'error');
                    return;
                }
                
                // Fetch regularization state
                const regData = await safeSelectSingle('unoric_regularizacion_estado', 'regularizado_hasta_anio, regularizado_hasta_fecha', 'cedula_socio', cedula);
                const regularizacion = regData ? { anio: regData.regularizado_hasta_anio, fecha: regData.regularizado_hasta_fecha } : null;

                state.socio = socio;
                const activo = isSocioActivoValue(socio.estado);
                const statusColor = activo ? '#16a34a' : '#ef4444';
                const statusIcon = activo ? 'fa-check-circle' : 'fa-times-circle';
                const statusText = activo ? 'SOCIO ACTIVO' : 'SOCIO RETIRADO';

                socioInfo.style.display = 'block';
                socioInfo.innerHTML = `
                    <div style="background: linear-gradient(to right, var(--bg-color), transparent); border-left: 4px solid ${statusColor}; padding: 1rem; border-radius: 0 var(--radius-lg) var(--radius-lg) 0; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-sm);">
                        <div>
                            <div class="text-xs font-bold text-muted uppercase tracking-wider mb-1">Información del Socio</div>
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <div class="text-xl font-extrabold text-primary" style="text-transform: uppercase;">${socio.socio}</div>
                                ${socio.socio_desde ? `<span class="badge badge-info" style="font-size: 0.7rem; padding: 4px 8px;"><i class="far fa-calendar-alt mr-1"></i> Desde: ${socio.socio_desde}</span>` : ''}
                            </div>
                            <div class="text-sm text-muted mt-1">
                                <i class="fas fa-id-card mr-1"></i> ${socio.cedula}
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="badge" style="background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}30; padding: 0.5rem 1rem; font-size: 0.85rem; letter-spacing: 0.05em; font-weight: 700;">
                                <i class="fas ${statusIcon} mr-1"></i> ${statusText}
                            </span>
                        </div>
                    </div>
                `;

                // 2. Lotes
                const lotes = await fetchLotesBySocio(cedula);
                state.loteCount = lotes.length;

                // 3. Tarifas
                const tipos = await fetchTiposPago();
                const mensTipo = tipos.find(t => {
                    const c = (t.codigo || '').toUpperCase().trim();
                    const d = (t.descripcion || '').toLowerCase();
                    return c === 'MENSUALIDAD' || d.includes('mensual');
                });
                state.mensualidadTipoId = mensTipo?.id;
                
                if (mensTipo) {
                    state.mensualidadTarifas = await fetchTipoPagoTarifasPorAnio(mensTipo.id);
                }

                // 4. Pagos y Obligaciones
                const pagosDeSocio = await fetchPagosPorSocio(cedula);
                
                // Separar Mensualidades de Otros
                const mensPagos = (pagosDeSocio || []).filter(p => p.tipo_pago_id === state.mensualidadTipoId);
                const otrosPagos = (pagosDeSocio || []).filter(p => p.tipo_pago_id !== state.mensualidadTipoId && p.estado !== 'PAGADO');

                state.mensualidadItems = buildMensualidadItems(mensPagos, state.loteCount, state.mensualidadTarifas, mensTipo?.monto_base, state.socio.socio_desde, regularizacion);
                state.otrasObligaciones = otrosPagos;

                renderMensualidades();
                renderOtros();
                updateDashboard();

                if (!activo) {
                    setInlineMessage(pagoMsg, 'Socio retirado: consulte con tesorería.', 'error');
                    pagoSubmit.disabled = true;
                }

            } catch (err) {
                console.error(err);
                setInlineMessage(pagoMsg, `Error de carga: ${err.message}`, 'error');
            }
        });
    }

    buscarBtn.addEventListener('click', loadSocioAndData);
    cedulaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadSocioAndData(); });

    pagoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sel = state.selection;
        if (!sel) return;

        const monto = Number(pagoMonto.value);
        if (!monto || monto <= 0) {
            await showAlert('Monto inválido', 'Por favor, ingresa un monto mayor a cero.');
            return;
        }

        const confirmacion = await showConfirm('Confirmar Recaudación', `¿Deseas registrar el pago de <strong>$${formatMoney(monto)}</strong> para este socio?`);
        if (!confirmacion) return;

        await withLoader('Procesando pago...', async () => {
            try {
                const client = getSupabaseClient();
                let pagoId = null;

                if (sel.kind === 'mens') {
                    const item = sel.item;
                    const hastaMes = Number(hastaMesSelect.value);
                    const fechaHasta = `${item.year}-${String(hastaMes).padStart(2, '0')}-${lastDayOfMonth(item.year, hastaMes)}`;
                    
                    if (item.existingId) {
                        const { error } = await client.from('unoric_pagos').update({
                            periodo_hasta: fechaHasta,
                            monto_esperado: monto + (item.monto_abonado || 0)
                        }).eq('id', item.existingId);
                        if (error) throw error;
                        pagoId = item.existingId;
                    } else {
                        const { data, error } = await client.from('unoric_pagos').insert([{
                            cedula_socio: state.socio.cedula,
                            tipo_pago_id: state.mensualidadTipoId,
                            descripcion: `Mensualidad ${item.year} hasta ${monthNameES(hastaMes)}`,
                            monto_esperado: monto,
                            periodo_desde: `${item.year}-01-01`,
                            periodo_hasta: fechaHasta,
                            estado: 'PENDIENTE',
                            created_by: currentUser?.id
                        }]).select().single();
                        if (error) throw error;
                        pagoId = data.id;
                    }
                } else {
                    pagoId = sel.item.id;
                }

                const { error: regError } = await client.from('unoric_pagos_registros').insert([{
                    pago_id: pagoId,
                    monto: monto,
                    fecha_pago: pagoFecha.value,
                    referencia: pagoReferencia.value,
                    observaciones: pagoObservaciones.value,
                    created_by: currentUser?.id
                }]);
                if (regError) throw regError;

                if (modalRecaudacion) modalRecaudacion.classList.add('hidden');
                await showAlert('Pago registrado', 'El cobro se ha registrado correctamente.');
                loadSocioAndData(); 

            } catch (err) {
                console.error(err);
                await showAlert('Error', 'No se pudo completar la operación: ' + err.message);
            }
        });
    });

    // --- CARGO MANUAL ---
    if (btnCrearManual) {
        btnCrearManual.addEventListener('click', async () => {
            if (!state.socio) { 
                await showAlert('Atención', 'Primero debes seleccionar un socio para asignarle un cargo.');
                return; 
            }
            modalManual.classList.remove('hidden');
            const tipos = await fetchTiposPago();
            const manualTipoSelect = document.getElementById('manual-tipo');
            manualTipoSelect.innerHTML = tipos.map(t => `<option value="${t.id}">${t.codigo}</option>`).join('');
            updateManualTotal();
        });
    }

    function updateManualTotal() {
        const u = Number(manualUnitario.value || 0);
        const total = u * (state.loteCount || 0);
        manualTotalPreview.textContent = `Total proyectado: $${formatMoney(total)} (${state.loteCount} lotes)`;
    }

    if (manualUnitario) {
        manualUnitario.addEventListener('input', updateManualTotal);
    }

    const closeManual = document.getElementById('close-modal-manual');
    if (closeManual) {
        closeManual.addEventListener('click', () => modalManual.classList.add('hidden'));
    }

    const formManual = document.getElementById('cobros-form-manual');
    if (formManual) {
        formManual.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tipoId = document.getElementById('manual-tipo').value;
            const desc = document.getElementById('manual-desc').value;
            const unit = Number(manualUnitario.value);
            
            await withLoader('Creando cargo...', async () => {
                try {
                    const client = getSupabaseClient();
                    const { error } = await client.from('unoric_pagos').insert([{
                        cedula_socio: state.socio.cedula,
                        tipo_pago_id: tipoId,
                        descripcion: desc,
                        monto_esperado: unit,
                        estado: 'PENDIENTE',
                        created_by: currentUser?.id
                    }]);
                    if (error) throw error;
                    await showAlert('Éxito', 'El cargo manual se ha creado correctamente.');
                    modalManual.classList.add('hidden');
                    loadSocioAndData();
                } catch (err) {
                    await showAlert('Error', 'No se pudo crear el cargo: ' + err.message);
                }
            });
        });
    }
}

// ==========================================
// REGULARIZACIÓN MODULE (ADMIN)
// ==========================================
let regState = {
    socio: null,
    estado: null,
    tipos: [],
    socioActivo: true
};

async function initRegularizacionModule() {
    const cedulaInput = document.getElementById('reg-cedula');
    const buscarBtn = document.getElementById('reg-buscar');
    const socioInfo = document.getElementById('reg-socio-info');
    const estadoActual = document.getElementById('reg-estado-actual');

    const estadoForm = document.getElementById('reg-form-estado');
    const hastaFecha = document.getElementById('reg-hasta-fecha');
    const observaciones = document.getElementById('reg-observaciones');
    const guardarBtn = document.getElementById('reg-guardar-estado');
    const estadoMsg = document.getElementById('reg-estado-msg');

    const pagoForm = document.getElementById('reg-form-pago');
    const tipoSelect = document.getElementById('reg-tipo');
    const fechaPago = document.getElementById('reg-fecha-pago');
    const monto = document.getElementById('reg-monto');
    const referencia = document.getElementById('reg-referencia');
    const descripcion = document.getElementById('reg-descripcion');
    const pagoMsg = document.getElementById('reg-pago-msg');

    fechaPago.value = todayISODate();

    const canEdit = isAdmin();
    if (!canEdit) {
        socioInfo.style.display = 'block';
        socioInfo.textContent = 'Acceso restringido: solo ADMIN.';
    }

    function setEnabled(enabled) {
        const on = enabled && canEdit;
        const pagoOn = on && regState.socioActivo;
        [hastaFecha, observaciones, guardarBtn].forEach(el => el.disabled = !on);
        [tipoSelect, fechaPago, monto, referencia, descripcion].forEach(el => el.disabled = !pagoOn);
        document.getElementById('reg-registrar-pago').disabled = !pagoOn;

        if (on && !regState.socioActivo) {
            setInlineMessage(pagoMsg, 'Socio retirado: no se pueden registrar pagos.', 'error');
        }
    }

    setEnabled(false);

    async function loadSocioAndEstado() {
        setInlineMessage(estadoMsg, '', '');
        setInlineMessage(pagoMsg, '', '');
        const cedula = (cedulaInput.value || '').trim();
        if (!cedula) return;
        await withLoader('Consultando regularización...', async () => {
            try {
                const socio = await safeSelectSingle('unoric_socios', 'cedula, socio, estado', 'cedula', cedula);
                if (!socio) {
                    socioInfo.style.display = 'block';
                    socioInfo.textContent = 'Socio no encontrado.';
                    estadoActual.textContent = 'Busca un socio para ver su estado.';
                    setEnabled(false);
                    return;
                }
                regState.socio = socio;
                regState.socioActivo = isSocioActivoValue(socio.estado);
                socioInfo.style.display = 'block';
                socioInfo.textContent = `${socio.socio || ''} (Cédula: ${socio.cedula})${regState.socioActivo ? '' : ' - RETIRADO'}`;

                const estado = await safeSelectSingle('unoric_regularizacion_estado', 'cedula_socio, regularizado_hasta_anio, regularizado_hasta_fecha, observaciones', 'cedula_socio', socio.cedula);
                regState.estado = estado;

                const hasta = estado?.regularizado_hasta_fecha || '';
                const ok = hasta && hasta >= REGULARIZACION_CORTE_FECHA;
                estadoActual.textContent = estado
                    ? `Regularizado hasta: ${hasta || '—'}${ok ? ' (Cumple corte 2025-11-30)' : ''}`
                    : 'Sin registro de regularización.';

                hastaFecha.value = hasta;
                observaciones.value = estado?.observaciones || '';

                regState.tipos = await fetchTiposPago();
                const regTipos = regState.tipos.filter(t => t.es_regularizacion === true);
                tipoSelect.innerHTML = '<option value="">Selecciona...</option>' + regTipos.map(t => `<option value="${t.id}">${t.codigo} - ${t.descripcion}</option>`).join('');

                setEnabled(true);
            } catch (e) {
                console.error(e);
                socioInfo.style.display = 'block';
                socioInfo.textContent = `Error: ${e.message}`;
                setEnabled(false);
            }
        });
    }

    buscarBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loadSocioAndEstado();
    });
    cedulaInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadSocioAndEstado();
        }
    });

    estadoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setInlineMessage(estadoMsg, '', '');
        if (!isAdmin()) return;
        if (!regState.socio) {
            setInlineMessage(estadoMsg, 'Busca un socio primero.', 'error');
            return;
        }

        const fecha = hastaFecha.value;
        if (!fecha) {
            setInlineMessage(estadoMsg, 'Selecciona una fecha de regularización.', 'error');
            return;
        }

        const payload = {
            cedula_socio: regState.socio.cedula,
            regularizado_hasta_fecha: fecha,
            regularizado_hasta_anio: Number(fecha.slice(0, 4)),
            observaciones: (observaciones.value || '').trim() || null,
            created_by: currentUser?.id,
            updated_at: new Date().toISOString()
        };

        await withLoader('Guardando regularización...', async () => {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('unoric_regularizacion_estado')
                    .upsert(payload, { onConflict: 'cedula_socio' });
                if (error) throw error;

                setInlineMessage(estadoMsg, 'Regularización guardada correctamente.', 'success');
                await loadSocioAndEstado();
            } catch (err) {
                console.error(err);
                setInlineMessage(estadoMsg, `Error guardando regularización: ${err.message}`, 'error');
            }
        });
    });

    pagoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setInlineMessage(pagoMsg, '', '');
        if (!isAdmin()) return;
        if (!regState.socio) {
            setInlineMessage(pagoMsg, 'Busca un socio primero.', 'error');
            return;
        }

        if (!regState.socioActivo) {
            setInlineMessage(pagoMsg, 'Socio retirado: no se pueden registrar pagos.', 'error');
            setEnabled(true);
            return;
        }

        const tipoId = Number(tipoSelect.value);
        const montoNum = Number(monto.value);
        if (!tipoId) {
            setInlineMessage(pagoMsg, 'Selecciona un tipo de regularización.', 'error');
            return;
        }
        if (!montoNum || montoNum <= 0) {
            setInlineMessage(pagoMsg, 'Monto inválido.', 'error');
            return;
        }

        await withLoader('Registrando pago...', async () => {
            try {
                const client = getSupabaseClient();
                const pagoPayload = {
                    cedula_socio: regState.socio.cedula,
                    id_lote: null,
                    tipo_pago_id: tipoId,
                    descripcion: (descripcion.value || '').trim() || 'Regularización',
                    monto_esperado: montoNum,
                    periodo_desde: null,
                    periodo_hasta: null,
                    estado: 'PENDIENTE',
                    created_by: currentUser?.id
                };
                const { data: pagoRow, error: pagoError } = await client
                    .from('unoric_pagos')
                    .insert([pagoPayload])
                    .select('id')
                    .single();
                if (pagoError) throw pagoError;

                const regPayload = {
                    pago_id: pagoRow.id,
                    fecha_pago: fechaPago.value || todayISODate(),
                    monto: montoNum,
                    referencia: (referencia.value || '').trim() || null,
                    observaciones: (descripcion.value || '').trim() || null,
                    created_by: currentUser?.id
                };
                const { error: regError } = await client
                    .from('unoric_pagos_registros')
                    .insert([regPayload]);
                if (regError) throw regError;

                setInlineMessage(pagoMsg, 'Pago de regularización registrado.', 'success');
                monto.value = '';
                referencia.value = '';
                // keep description
            } catch (err) {
                console.error(err);
                setInlineMessage(pagoMsg, `Error registrando pago: ${err.message}`, 'error');
            }
        });
    });
}

// ==========================================
// TIPOS DE PAGO MODULE (ADMIN)
// ==========================================
let tiposState = {
    all: [],
    filtered: [],
    editingTipoId: null,
    tarifas: []
};

async function initTiposPagoModule() {
    const searchInput = document.getElementById('tipos-search');
    const form = document.getElementById('tipos-form');
    const formTitle = document.getElementById('tipos-form-title');
    const idInput = document.getElementById('tipos-id');
    const codigoInput = document.getElementById('tipos-codigo');
    const descInput = document.getElementById('tipos-descripcion');
    const montoBaseInput = document.getElementById('tipos-monto-base');
    const afectaSelect = document.getElementById('tipos-afecta');
    const regSelect = document.getElementById('tipos-regularizacion');
    const cancelarBtn = document.getElementById('tipos-cancelar');
    const msgEl = document.getElementById('tipos-msg');
    const body = document.getElementById('tipos-body');

    // Tarifas por año
    const tarifasCard = document.getElementById('tipos-tarifas-card');
    const tarifasForm = document.getElementById('tipos-tarifas-form');
    const tarifaAnio = document.getElementById('tipos-tarifa-anio');
    const tarifaMonto = document.getElementById('tipos-tarifa-monto');
    const tarifaActivo = document.getElementById('tipos-tarifa-activo');
    const tarifasMsg = document.getElementById('tipos-tarifas-msg');
    const tarifasBody = document.getElementById('tipos-tarifas-body');

    const canEdit = isAdmin();
    if (!canEdit) {
        setInlineMessage(msgEl, 'Acceso restringido: solo ADMIN puede crear/editar.', 'error');
    }

    function setTarifasVisible(visible) {
        if (!tarifasCard) return;
        tarifasCard.style.display = visible ? '' : 'none';
    }

    function resetTarifaForm() {
        if (!tarifaAnio || !tarifaMonto || !tarifaActivo) return;
        tarifaAnio.value = '';
        tarifaMonto.value = '';
        tarifaActivo.value = 'true';
        setInlineMessage(tarifasMsg, '', '');
    }

    function renderTarifas(list) {
        if (!tarifasBody) return;
        if (!tiposState.editingTipoId) {
            tarifasBody.innerHTML = `<tr><td colspan="4" class="text-center p-4">Selecciona un tipo para ver tarifas</td></tr>`;
            return;
        }
        if (!list || list.length === 0) {
            tarifasBody.innerHTML = `<tr><td colspan="4" class="text-center p-4">Sin tarifas</td></tr>`;
            return;
        }

        const ordered = [...list].sort((a, b) => Number(b.anio) - Number(a.anio));
        tarifasBody.innerHTML = ordered.map(r => {
            const activoTxt = r.activo ? '<span class="badge badge-success">Sí</span>' : '<span class="badge badge-danger">No</span>';
            const montoTxt = `$${formatMoney(r.monto)}`;
            const btnInactivar = r.activo
                ? `<button class="btn btn-secondary btn-sm" data-tarifa-inactivar="${r.anio}">Inactivar</button>`
                : '-';
            const btnEditar = `<button class="btn btn-primary btn-sm" data-tarifa-editar="${r.anio}"><i class="fas fa-edit"></i></button>`;
            return `
                <tr>
                    <td>${r.anio}</td>
                    <td>${montoTxt}</td>
                    <td>${activoTxt}</td>
                    <td style="display:flex; gap:0.5rem; align-items:center;">
                        ${btnEditar}
                        ${btnInactivar}
                    </td>
                </tr>
            `;
        }).join('');

        tarifasBody.querySelectorAll('button[data-tarifa-editar]').forEach(btn => {
            btn.addEventListener('click', () => {
                const anio = Number(btn.getAttribute('data-tarifa-editar'));
                const row = (tiposState.tarifas || []).find(x => Number(x.anio) === anio);
                if (!row) return;
                tarifaAnio.value = String(row.anio);
                tarifaMonto.value = String(Number(row.monto).toFixed(2));
                tarifaActivo.value = String(!!row.activo);
                setInlineMessage(tarifasMsg, `Editando tarifa ${row.anio}.`, 'success');
            });
        });

        tarifasBody.querySelectorAll('button[data-tarifa-inactivar]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!canEdit) return;
                const anio = Number(btn.getAttribute('data-tarifa-inactivar'));
                if (!anio) return;
                await withLoader('Inactivando tarifa...', async () => {
                    try {
                        const client = getSupabaseClient();
                        const { error } = await client
                            .from('unoric_tipos_pago_tarifas')
                            .update({ activo: false })
                            .eq('tipo_pago_id', tiposState.editingTipoId)
                            .eq('anio', anio);
                        if (error) throw error;
                        setInlineMessage(tarifasMsg, `Tarifa ${anio} inactivada.`, 'success');
                        await loadTarifasForEditingTipo();
                        resetTarifaForm();
                    } catch (err) {
                        console.error(err);
                        setInlineMessage(tarifasMsg, `Error inactivando: ${err.message}`, 'error');
                    }
                });
            });
        });
    }

    async function fetchTarifasList(tipoPagoId) {
        const client = getSupabaseClient();
        const { data, error } = await client
            .from('unoric_tipos_pago_tarifas')
            .select('anio, monto, activo')
            .eq('tipo_pago_id', tipoPagoId)
            .order('anio', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async function loadTarifasForEditingTipo() {
        if (!tiposState.editingTipoId) {
            tiposState.tarifas = [];
            renderTarifas([]);
            return;
        }
        try {
            tiposState.tarifas = await fetchTarifasList(tiposState.editingTipoId);
            renderTarifas(tiposState.tarifas);
        } catch (err) {
            console.error(err);
            if (tarifasBody) tarifasBody.innerHTML = `<tr><td colspan="4" class="text-center p-4">Error: ${err.message}</td></tr>`;
        }
    }

    function setFormEnabled(enabled) {
        const on = enabled && canEdit;
        [codigoInput, descInput, montoBaseInput, afectaSelect, regSelect].forEach(el => el.disabled = !on);
        document.getElementById('tipos-guardar').disabled = !on;
        cancelarBtn.disabled = !on;
    }

    function resetForm() {
        idInput.value = '';
        codigoInput.value = '';
        descInput.value = '';
        montoBaseInput.value = '';
        afectaSelect.value = 'false';
        regSelect.value = 'false';
        codigoInput.disabled = !canEdit ? true : false;
        formTitle.textContent = 'Nuevo tipo';
        setInlineMessage(msgEl, '', '');

        tiposState.editingTipoId = null;
        tiposState.tarifas = [];
        setTarifasVisible(false);
        resetTarifaForm();
        renderTarifas([]);
    }

    function render(list) {
        if (!list || list.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="text-center p-4">Sin resultados</td></tr>`;
            return;
        }
        const display = list.slice(0, 200);
        body.innerHTML = display.map(t => {
            const flags = [t.afecta_obligaciones ? 'afecta_obligaciones' : null, t.es_regularizacion ? 'es_regularizacion' : null]
                .filter(Boolean)
                .map(f => `<span class="badge badge-info" style="margin-right:0.25rem;">${f}</span>`)
                .join('');
            const action = canEdit
                ? `<button class="btn btn-primary btn-sm" data-edit-id="${t.id}"><i class="fas fa-edit"></i></button>`
                : '-';

            const montoTxt = (t.monto_base != null && Number(t.monto_base) > 0)
                ? `$${formatMoney(t.monto_base)}`
                : '-';
            return `
                <tr>
                    <td>${t.codigo}</td>
                    <td style="max-width: 260px; white-space: normal;">${t.descripcion}</td>
                    <td>${montoTxt}</td>
                    <td>${flags || '-'}</td>
                    <td>${action}</td>
                </tr>
            `;
        }).join('');

        if (canEdit) {
            body.querySelectorAll('button[data-edit-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = Number(btn.getAttribute('data-edit-id'));
                    const tipo = tiposState.all.find(x => x.id === id);
                    if (!tipo) return;
                    idInput.value = String(tipo.id);
                    codigoInput.value = tipo.codigo;
                    descInput.value = tipo.descripcion;
                    montoBaseInput.value = (tipo.monto_base != null) ? String(Number(tipo.monto_base)) : '';
                    afectaSelect.value = String(!!tipo.afecta_obligaciones);
                    regSelect.value = String(!!tipo.es_regularizacion);
                    formTitle.textContent = 'Editar tipo';
                    // prevent accidental breaking changes
                    codigoInput.disabled = true;
                    setInlineMessage(msgEl, '', '');

                    tiposState.editingTipoId = tipo.id;
                    setTarifasVisible(true);
                    resetTarifaForm();
                    loadTarifasForEditingTipo();
                });
            });
        }
    }

    function applyFilter() {
        const term = (searchInput.value || '').toLowerCase().trim();
        if (!term) {
            tiposState.filtered = [...tiposState.all];
        } else {
            tiposState.filtered = tiposState.all.filter(t => {
                return String(t.codigo || '').toLowerCase().includes(term) || String(t.descripcion || '').toLowerCase().includes(term);
            });
        }
        render(tiposState.filtered);
    }

    await withLoader('Cargando tipos de pago...', async () => {
        try {
            tiposState.all = await fetchTiposPago();
            tiposState.filtered = [...tiposState.all];
            render(tiposState.filtered);
        } catch (e) {
            console.error(e);
            body.innerHTML = `<tr><td colspan="4" class="text-center p-4">Error cargando: ${e.message}</td></tr>`;
        }
    });

    searchInput.addEventListener('input', applyFilter);
    cancelarBtn.addEventListener('click', () => {
        resetForm();
        setFormEnabled(true);
    });

    setFormEnabled(true);
    resetForm();

    if (tarifasForm) {
        tarifasForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            setInlineMessage(tarifasMsg, '', '');
            if (!canEdit) return;
            if (!tiposState.editingTipoId) {
                setInlineMessage(tarifasMsg, 'Selecciona un tipo primero.', 'error');
                return;
            }

            const anio = Number((tarifaAnio.value || '').trim());
            const monto = Number((tarifaMonto.value || '').trim());
            const activo = tarifaActivo.value === 'true';

            if (!anio || anio < 1900 || anio > 2200) {
                setInlineMessage(tarifasMsg, 'Año inválido.', 'error');
                return;
            }
            if (!Number.isFinite(monto) || monto <= 0) {
                setInlineMessage(tarifasMsg, 'Monto inválido.', 'error');
                return;
            }

            await withLoader('Guardando tarifa...', async () => {
                try {
                    const client = getSupabaseClient();
                    const payload = {
                        tipo_pago_id: tiposState.editingTipoId,
                        anio,
                        monto: Number(monto.toFixed(2)),
                        activo,
                        created_by: currentUser?.id
                    };

                    const { error } = await client
                        .from('unoric_tipos_pago_tarifas')
                        .upsert([payload], { onConflict: 'tipo_pago_id,anio' });
                    if (error) throw error;

                    setInlineMessage(tarifasMsg, `Tarifa ${anio} guardada.`, 'success');
                    await loadTarifasForEditingTipo();
                    resetTarifaForm();
                } catch (err) {
                    console.error(err);
                    setInlineMessage(tarifasMsg, `Error guardando tarifa: ${err.message}`, 'error');
                }
            });
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setInlineMessage(msgEl, '', '');
        if (!canEdit) return;

        const id = idInput.value ? Number(idInput.value) : null;
        const codigo = (codigoInput.value || '').trim();
        const descripcion = (descInput.value || '').trim();
        const montoBaseRaw = (montoBaseInput.value || '').trim();
        const afecta = afectaSelect.value === 'true';
        const esReg = regSelect.value === 'true';

        let monto_base = null;
        if (montoBaseRaw) {
            const n = Number(montoBaseRaw);
            if (!Number.isFinite(n) || n < 0) {
                setInlineMessage(msgEl, 'Monto base inválido.', 'error');
                return;
            }
            monto_base = Number(n.toFixed(2));
        }

        if (!id && !codigo) {
            setInlineMessage(msgEl, 'Código requerido.', 'error');
            return;
        }
        if (!descripcion) {
            setInlineMessage(msgEl, 'Descripción requerida.', 'error');
            return;
        }

        await withLoader('Guardando tipo...', async () => {
            try {
                const client = getSupabaseClient();
                if (!id) {
                    const payload = {
                        codigo,
                        descripcion,
                        monto_base,
                        afecta_obligaciones: afecta,
                        es_regularizacion: esReg,
                        created_by: currentUser?.id
                    };
                    const { error } = await client.from('unoric_tipos_pago').insert([payload]);
                    if (error) throw error;
                    setInlineMessage(msgEl, 'Tipo creado correctamente.', 'success');
                } else {
                    const payload = {
                        descripcion,
                        monto_base,
                        afecta_obligaciones: afecta,
                        es_regularizacion: esReg
                    };
                    const { error } = await client.from('unoric_tipos_pago').update(payload).eq('id', id);
                    if (error) throw error;
                    setInlineMessage(msgEl, 'Tipo actualizado correctamente.', 'success');
                }

                tiposState.all = await fetchTiposPago();
                applyFilter();
                resetForm();
            } catch (err) {
                console.error(err);
                setInlineMessage(msgEl, `Error guardando: ${err.message}`, 'error');
            }
        });
    });
}

// ==========================================
// CAJA MODULE (HUB)
// ==========================================
async function initCajaModule() {
    const btnCobros = document.getElementById('caja-goto-cobros');
    const btnGenerador = document.getElementById('caja-goto-generador');
    const btnMensualidades = document.getElementById('caja-goto-mensualidades');

    if (btnCobros) {
        btnCobros.addEventListener('click', () => {
            setActiveNav('cobros');
            loadView('cobros');
        });
    }

    if (btnGenerador) {
        btnGenerador.addEventListener('click', () => {
            // Nota: crear_cuotas no está en el nav lateral pero es accesible desde aquí
            loadView('crear_cuotas');
        });
    }

    if (btnMensualidades) {
        btnMensualidades.addEventListener('click', () => {
            setActiveNav('mensualidad');
            loadView('mensualidad');
        });
    }
}

// ==========================================
// GENERADOR DE CUOTAS MASIVAS (ADMIN)
// ==========================================
let cuotasState = {
    sociosFiltrados: [],
    tiposPago: []
};

async function initCrearCuotasModule() {
    const backBtn = document.getElementById('cuotas-back-btn');
    const tipoPagoSelect = document.getElementById('cuotas-tipo-pago');
    const fechaInput = document.getElementById('cuotas-fecha');
    const descripcionInput = document.getElementById('cuotas-descripcion');
    const montoInput = document.getElementById('cuotas-monto');
    
    // Filtros
    const filterDesde = document.getElementById('filter-desde-anio');
    const filterHasta = document.getElementById('filter-hasta-anio');
    const filterEtapa = document.getElementById('filter-cuotas-etapa');
    const filterActivos = document.getElementById('filter-cuotas-solo-activos');
    const filterConLote = document.getElementById('filter-cuotas-con-lote');
    
    const generarBtn = document.getElementById('cuotas-generar-btn');
    const countMsg = document.getElementById('cuotas-count-msg');
    const globalMsg = document.getElementById('cuotas-global-msg');

    fechaInput.value = todayISODate();

    // Resetear estado para evitar heredar filtros anteriores si se re-inicializa
    cuotasState.sociosFiltrados = [];

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            loadView('caja');
        });
    }

    // Auto-actualizar al cambiar filtros
    [filterDesde, filterHasta, filterEtapa, filterActivos, filterConLote].forEach(el => {
        if (el) {
            el.addEventListener('input', aplicarFiltros);
            el.addEventListener('change', aplicarFiltros);
        }
    });

    // Cargar tipos de pago (Fresco)
    try {
        cuotasState.tiposPago = await fetchTiposPago();
        tipoPagoSelect.innerHTML = '<option value="">Selecciona un tipo...</option>' + 
            cuotasState.tiposPago.map(t => `<option value="${t.id}">${t.codigo} - ${t.descripcion}</option>`).join('');
    } catch (err) {
        console.error('Error al cargar tipos de pago:', err);
    }

    // Forzar carga de datos frescos del servidor para este módulo específico
    await withLoader('Obteniendo datos actualizados...', async () => {
        await preloadAllData();
    });

    function aplicarFiltros() {
        const desde = Number(filterDesde.value) || 0;
        const hasta = Number(filterHasta.value) || 9999;
        const etapa = filterEtapa.value;
        const soloActivos = filterActivos.checked;
        const soloConLote = filterConLote.checked;

        cuotasState.sociosFiltrados = allSocios.filter(s => {
            // Antigüedad
            const anioSocio = socioDesdeYear(s);
            if (desde > 0 && anioSocio < desde) return false;
            if (hasta < 9999 && anioSocio > hasta) return false;

            // Etapa
            if (etapa !== 'all') {
                const tieneEtapa = s.lotes.some(l => String(l.etapa) === etapa);
                if (!tieneEtapa) return false;
            }

            // Estado
            if (soloActivos && !isSocioActivoValue(s.estado)) return false;

            // Con Lote
            if (soloConLote && (!s.lotes || s.lotes.length === 0)) return false;

            return true;
        });

        renderPreview();
    }

    function socioDesdeYear(socio) {
        const y = Number(socio.socio_desde);
        return Number.isFinite(y) ? y : 0;
    }

    function renderPreview() {
        const list = cuotasState.sociosFiltrados;
        if (countMsg) countMsg.textContent = `Se han encontrado ${list.length} socios que cumplen los criterios.`;
        
        generarBtn.disabled = list.length === 0;
        generarBtn.innerHTML = `<i class="fas fa-bolt"></i> Generar ${list.length} Pagos Masivos`;
        
        // La tabla ha sido eliminada por solicitud del usuario para simplificar.
    }

    generarBtn.addEventListener('click', async () => {
        if (!isAdmin()) {
            setInlineMessage(globalMsg, 'Error: Solo un administrador puede realizar esta acción.', 'error');
            return;
        }

        const tipoId = Number(tipoPagoSelect.value);
        const originalDescripcion = descripcionInput.value.trim();
        const monto = Number(montoInput.value);
        const fecha = fechaInput.value;
        const anio = filterHasta.value || new Date(fecha).getFullYear();
        
        // Formato solicitado: nombre - año
        const descripcion = `${originalDescripcion} - ${anio}`;

        if (!tipoId || !originalDescripcion || !monto || !fecha) {
            setInlineMessage(globalMsg, 'Error: Completa todos los campos obligatorios en el Paso 1.', 'error');
            return;
        }

        const confirmar = await showConfirm('Confirmar Generación Masiva', `
            <div style="text-align:center;">
                <p>¿Estás seguro de generar <strong>${cuotasState.sociosFiltrados.length}</strong> cobros masivos?</p>
                <div class="card" style="background:#f8fafc; padding:1rem; margin-top:1rem; border:1px solid #e2e8f0; text-align:left;">
                    <p><strong>Concepto:</strong> ${descripcion}</p>
                    <p><strong>Monto c/u:</strong> $${monto.toFixed(2)}</p>
                    <p><strong>Total estimate:</strong> $${(monto * cuotasState.sociosFiltrados.length).toFixed(2)}</p>
                </div>
            </div>
        `);
        if (!confirmar) return;

        await withLoader('Generando obligaciones masivas...', async () => {
            try {
                const client = getSupabaseClient();
                const total = cuotasState.sociosFiltrados.length;
                const batchSize = 50; 
                let exitosos = 0;

                for (let i = 0; i < total; i += batchSize) {
                    const batch = cuotasState.sociosFiltrados.slice(i, i + batchSize);
                    const records = batch.map(s => ({
                        cedula_socio: s.cedula,
                        tipo_pago_id: tipoId,
                        descripcion: descripcion,
                        monto_esperado: monto,
                        fecha_solicitud: fecha,
                        estado: 'PENDIENTE',
                        created_by: currentUser?.id
                    }));

                    const { error } = await client.from('unoric_pagos').insert(records);
                    if (error) throw error;
                    exitosos += batch.length;
                    
                    if (total > batchSize) {
                        setInlineMessage(globalMsg, `Procesando: ${exitosos} de ${total}...`, 'success');
                    }
                }

                // Modal elegante de éxito
                const btnNo = document.getElementById('confirm-btn-no');
                const btnYes = document.getElementById('confirm-btn-yes');
                const oldNoText = btnNo.textContent;
                const oldYesText = btnYes.textContent;
                
                btnNo.style.display = 'none';
                btnYes.textContent = '¡Entendido!';

                await showConfirm('¡Generación Exitosa!', `
                    <div style="text-align:center; padding:1rem;">
                        <i class="fas fa-check-circle" style="font-size:4rem; color:var(--success-color); margin-bottom:1.5rem; display:block;"></i>
                        <h3 style="margin-bottom:1rem;">¡Proceso Completado!</h3>
                        <p style="font-size:1.1rem; margin-bottom:1rem;">Se han creado correctamente <strong>${exitosos}</strong> cobros.</p>
                        <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:1rem; border-radius:0.5rem; text-align:left;">
                            <p style="margin:0; color:#166534;"><strong>Motivo:</strong> ${descripcion}</p>
                            <p style="margin:0; color:#166534;"><strong>Monto:</strong> $${monto.toFixed(2)}</p>
                        </div>
                    </div>
                `);

                // Restaurar modal
                btnNo.style.display = '';
                btnNo.textContent = oldNoText;
                btnYes.textContent = oldYesText;

                // Bloquear botón para evitar doble envío accidental
                generarBtn.disabled = true;
                
                // Limpiar campos
                descripcionInput.value = '';
                montoInput.value = '';
                
                // Cargar pagos existentes para refrescar la lista de abajo
                cargarPagosExistentes(anio);

            } catch (err) {
                console.error(err);
                setInlineMessage(globalMsg, `Error durante la generación: ${err.message}`, 'error');
            }
        });
    });

    // ==========================================
    // SECCIÓN: PAGOS EXISTENTES POR AÑO
    // ==========================================
    const pagosExistentesBtns = document.getElementById('pagos-existentes-btns');
    const pagosExistentesBody = document.getElementById('pagos-existentes-body');
    const pagosExistentesCount = document.getElementById('pagos-existentes-count');

    async function cargarPagosExistentes(anio) {
        if (!anio) {
            pagosExistentesBody.innerHTML = '<p class="text-center w-full p-4">Selecciona un año para ver los pagos generados.</p>';
            pagosExistentesCount.textContent = 'Selecciona un año para ver los pagos generados.';
            return;
        }

        // Mostrar skeletons mientras carga
        pagosExistentesBody.innerHTML = Array(4).fill(0).map(() => '<div class="pagos-skeleton"></div>').join('');
        pagosExistentesCount.textContent = `Buscando pagos de ${anio}...`;

        try {
            const client = getSupabaseClient();
            
            // Buscar pagos cuya descripción contenga el año seleccionado (ej: "2019")
            const { data: pagos, error } = await client
                .from('unoric_pagos')
                .select('id, descripcion, tipo_pago_id, monto_esperado, fecha_solicitud, cedula_socio, created_at')
                .ilike('descripcion', `%${anio}%`)
                .order('descripcion', { ascending: true });

            if (error) throw error;

            // Obtener IDs de tipos a excluir: REGULARIZACION y MENSUALIDAD
            const tiposExcluirIds = new Set(
                cuotasState.tiposPago
                    .filter(t => t.es_regularizacion || t.codigo === 'MENSUALIDAD' || t.codigo === 'MENS')
                    .map(t => t.id)
            );

            // Filtrar pagos excluyendo los tipos REGULARIZACION y MENSUALIDAD
            const pagosFiltrados = pagos.filter(p => !tiposExcluirIds.has(p.tipo_pago_id));

            if (!pagosFiltrados || pagosFiltrados.length === 0) {
                pagosExistentesBody.innerHTML = `<p class="text-center w-full p-4">No hay pagos con "${anio}" en la descripción.</p>`;
                pagosExistentesCount.textContent = `No se encontraron pagos con "${anio}" en la descripción.`;
                return;
            }

            // Agrupar por descripción, tipo y monto (sin fecha, ya que es el mismo concepto masivo)
            const agrupados = {};
            pagosFiltrados.forEach(p => {
                const key = `${p.descripcion}|${p.monto_esperado}|${p.tipo_pago_id}`;
                if (!agrupados[key]) {
                    agrupados[key] = {
                        descripcion: p.descripcion,
                        tipo_pago_id: p.tipo_pago_id,
                        monto: p.monto_esperado,
                        cantidad: 0,
                        total: 0
                    };
                }
                agrupados[key].cantidad++;
                agrupados[key].total += p.monto_esperado;
            });

            // Obtener nombres de tipos de pago (solo antes del guión)
            const tiposMap = {};
            cuotasState.tiposPago.forEach(t => { 
                const full = `${t.codigo} - ${t.descripcion}`;
                tiposMap[t.id] = full.split('-')[0].trim();
            });

            const grupos = Object.values(agrupados).sort((a, b) => a.descripcion.localeCompare(b.descripcion));
            
            // Renderizar con animación
            pagosExistentesBody.innerHTML = grupos.map((g, index) => `
                <div class="card animate-fade-in-stretch" style="padding: 0.6rem; min-width: 170px; flex: 1 1 calc(25% - 0.75rem); border: 1px solid #eef2f7; box-shadow: 0 2px 4px rgba(0,0,0,0.04); background: #fff; animation-delay: ${index * 0.05}s; position: relative; group;">
                    <button class="btn-delete-pago" data-descripcion="${g.descripcion}" style="position: absolute; top: 5px; right: 5px; background: none; border: none; color: #ef4444; cursor: pointer; padding: 2px; font-size: 0.8rem; opacity: 0.6; transition: 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" title="Eliminar este grupo de pagos">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                    <div style="font-weight: 600; margin-bottom: 0.35rem; font-size: 0.85rem; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 20px;" title="${g.descripcion}">
                        ${g.descripcion || '—'}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="badge badge-info" style="font-size: 0.65rem; padding: 1px 5px; background: #e0f2fe; color: #0369a1; border: none;">
                            ${tiposMap[g.tipo_pago_id] || 'N/A'}
                        </span>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span style="font-weight: 700; font-size: 0.95rem; color: #0f172a;">$${g.monto.toFixed(2)}</span>
                            <span style="font-size: 0.6rem; color: var(--text-muted);">${g.cantidad} socios</span>
                        </div>
                    </div>
                </div>
            `).join('');

            pagosExistentesCount.textContent = `Se encontraron ${pagosFiltrados.length} pagos con "${anio}" (${grupos.length} conceptos diferentes).`;

        } catch (err) {
            console.error('Error al cargar pagos existentes:', err);
            pagosExistentesBody.innerHTML = `<p class="text-center w-full p-4 text-danger">Error: ${err.message}</p>`;
        }
    }

    // Event listeners para botones de año
    if (pagosExistentesBtns) {
        pagosExistentesBtns.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-anio]');
            if (!btn) return;
            
            // Marcar botón activo
            pagosExistentesBtns.querySelectorAll('button').forEach(b => b.classList.remove('btn-primary'));
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-outline');
            
            // Cargar pagos del año seleccionado
            const anio = btn.dataset.anio;
            cargarPagosExistentes(anio);
        });
    }

    // Delegación de eventos para eliminar pagos
    if (pagosExistentesBody) {
        pagosExistentesBody.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-delete-pago');
            if (!btn) return;

            const descripcion = btn.dataset.descripcion;
            const currentAnioBtn = pagosExistentesBtns.querySelector('.btn-primary');
            const anio = currentAnioBtn ? currentAnioBtn.dataset.anio : '2019';

            const confirmar = await showConfirm(
                'Eliminar Pagos Masivos', 
                `<div style="text-align:center;">
                    <p>¿Estás seguro de eliminar todos los pagos con la descripción:</p>
                    <p style="margin: 1rem 0; font-weight: 700; color: var(--accent-red);">${descripcion}</p>
                    <p style="font-size: 0.9rem; color: var(--text-muted);">Esta acción no se puede deshacer y afectará a todos los socios que tienen este cobro pendiente o pagado.</p>
                </div>`
            );

            if (!confirmar) return;

            await withLoader('Eliminando pagos...', async () => {
                try {
                    const client = getSupabaseClient();
                    const { error } = await client
                        .from('unoric_pagos')
                        .delete()
                        .eq('descripcion', descripcion);

                    if (error) throw error;
                    
                    // Notificar éxito y refrescar
                    showAlert('Éxito', 'Los pagos seleccionados han sido eliminados correctamente.');
                    cargarPagosExistentes(anio);
                } catch (err) {
                    console.error('Error al eliminar pagos:', err);
                    showAlert('Error', `No se pudieron eliminar los pagos: ${err.message}`);
                }
            });
        });
    }

    // Cargar previsualización inicial y pagos 2019 (default)
    aplicarFiltros();
    
    if (pagosExistentesBtns) {
        const defaultBtn = pagosExistentesBtns.querySelector('button[data-anio="2019"]');
        if (defaultBtn) {
            defaultBtn.classList.add('btn-primary');
            defaultBtn.classList.remove('btn-outline');
            cargarPagosExistentes('2019');
        }
    }
}

// ==========================================
// SOCIOS MODULE LOGIC
// ==========================================

async function initSociosModule() {
    const tableBody = document.getElementById('socios-table-body');
    const totalSociosEl = document.getElementById('total-socios');
    const sociosConLotesEl = document.getElementById('socios-con-lotes');
    const sociosIncompleteEl = document.getElementById('socios-incomplete');
    const searchInput = document.getElementById('search-socios');
    const filterEtapa = document.getElementById('filter-etapa');
    const filterEstado = document.getElementById('filter-estado');

    beginLoading('Cargando socios...');
    try {
        const client = getSupabaseClient();

        // Fetch Socios
        const { data: socios, error: sociosError } = await client
            .from('unoric_socios')
            .select('*');

        if (sociosError) throw sociosError;

        // Fetch Lotes
        const { data: lotes, error: lotesError } = await client
            .from('unoric_lotes')
            .select('*');

        if (lotesError) throw lotesError;

        // Process Data
        allSocios = socios.map(socio => {
            const socioLotes = lotes.filter(l => l.socio === socio.cedula);
            const hasLotes = socioLotes.length > 0;

            // Check for invalid contact info
            const invalidPhone = socio.celular === '999999999';
            const invalidEmail = !socio.correo || socio.correo.includes('sin@correo') || socio.correo.includes('actualizar@correo');

            // Needs update if has lotes AND (invalid phone OR invalid email)
            const needsUpdate = hasLotes && (invalidPhone || invalidEmail);

            return {
                ...socio,
                lotes: socioLotes,
                hasLotes,
                needsUpdate,
                invalidPhone,
                invalidEmail
            };
        });

        // Update Stats
        totalSociosEl.textContent = allSocios.length;
        sociosConLotesEl.textContent = allSocios.filter(s => s.hasLotes).length;
        sociosIncompleteEl.textContent = allSocios.filter(s => s.needsUpdate).length;

        // Initial Render
        filteredSocios = [...allSocios];
        renderSociosTable(filteredSocios);

        // Persist lightweight cache for other modules (e.g., Cobro mensualidad)
        writeSociosQuickCache(allSocios);

        // Event Listeners
        searchInput.addEventListener('input', (e) => filterSocios(e.target.value, filterEtapa.value, filterEstado.value));
        filterEtapa.addEventListener('change', (e) => filterSocios(searchInput.value, e.target.value, filterEstado.value));
        filterEstado.addEventListener('change', (e) => filterSocios(searchInput.value, filterEtapa.value, e.target.value));

        // Nuevo socio button
        const newBtn = document.getElementById('socios-new-btn');
        if (newBtn && newBtn.dataset.bound !== 'true') {
            newBtn.dataset.bound = 'true';
            newBtn.addEventListener('click', () => {
                openSocioCreateModal();
            });
        }

    } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center error-message">Error cargando datos: ${error.message}</td></tr>`;
    } finally {
        endLoading();
    }
}

// ==========================================
// COBRO MENSUALIDAD MODULE
// ==========================================
let mensState = {
    socio: null,
    socioActivo: true,
    tipos: [],
    mensualidadTipoIds: [],
    mensualidadTipoMontoBase: null,
    tarifasPorAnio: new Map(),
    pagos: [],
    selectedPago: null,
    items: [],
    defaultMonto: null
};

async function initMensualidadModule() {
    const searchInput = document.getElementById('mens-search');
    const localResults = document.getElementById('mens-local-results');
    const socioInfo = document.getElementById('mens-socio-info');
    const msgEl = document.getElementById('mens-msg');
    const body = document.getElementById('mens-body');

    const dashboardEl = document.getElementById('mens-dashboard');
    const statLotesEl = document.getElementById('mens-stat-lotes');
    const statPendienteEl = document.getElementById('mens-stat-pendiente');

    const seleccionInfo = document.getElementById('mens-seleccion');
    const form = document.getElementById('mens-form');
    const fechaEl = document.getElementById('mens-fecha');
    const hastaMesEl = document.getElementById('mens-hasta-mes');
    const montoEl = document.getElementById('mens-monto');
    const refEl = document.getElementById('mens-referencia');
    const obsEl = document.getElementById('mens-observaciones');
    const submitBtn = document.getElementById('mens-registrar');
    const pagoMsg = document.getElementById('mens-pago-msg');

    fechaEl.value = todayISODate();

    function resetSelection() {
        mensState.selectedPago = null;
        seleccionInfo.textContent = 'Selecciona un año pendiente en la tabla.';
        submitBtn.disabled = true;
        setInlineMessage(pagoMsg, '', '');
    }

    function setDashboardVisible(visible) {
        if (!dashboardEl) return;
        dashboardEl.style.display = visible ? '' : 'none';
    }

    function updateDashboard() {
        if (statLotesEl) statLotesEl.textContent = String(mensState.loteCount ?? 0);
        const totalPendiente = (mensState.items || [])
            .filter(it => it.kind === 'pendiente')
            .reduce((acc, it) => acc + Number(it.pendienteMonto || 0), 0);
        if (statPendienteEl) statPendienteEl.textContent = `$${formatMoney(totalPendiente)}`;
        setDashboardVisible(true);
    }

    function applySocioActivoGates() {
        const bloqueado = mensState.socio && !mensState.socioActivo;
        if (bloqueado) {
            resetSelection();
            setInlineMessage(msgEl, 'Socio retirado: no se pueden registrar cobros.', 'error');
        }
        return !bloqueado;
    }

    function renderLocalMatches(matches) {
        if (!matches || matches.length === 0) {
            localResults.innerHTML = '';
            return;
        }
        const top = matches.slice(0, 12);
        localResults.innerHTML = `
            <div class="mt-4" style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.5rem; box-shadow: var(--shadow-sm);">
                <div class="text-muted text-xs font-bold uppercase mb-4 px-1" style="letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-search text-primary" style="font-size: 0.8rem;"></i>
                    Coincidencias encontradas (${matches.length}):
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; width: 100%;">
                    ${top.map(s => {
            const activo = isSocioActivoValue(s.estado);
            const desde = s.socio_desde ? `<div class="text-xs text-muted mt-2" style="background: rgba(0,0,0,0.03); padding: 4px 8px; border-radius: 4px; display: inline-block;"><i class="far fa-calendar-alt mr-1"></i> Socio desde: <strong>${s.socio_desde}</strong></div>` : '';
            return `
                            <button type="button" class="btn btn-secondary btn-sm" style="display:block; text-align: left; background: var(--card-bg); padding: 1.5rem; border: 1px solid var(--border-color); transition: all 0.2s; height: auto; width: 100%; box-shadow: var(--shadow-sm); position: relative; overflow: hidden;" data-cedula="${s.cedula}">
                                <div style="display:flex; justify-content: space-between; align-items: flex-start;">
                                    <div style="flex: 1; padding-right: 12px;">
                                        <div style="font-weight: 800; color: var(--primary-color); line-height: 1.3; font-size: 1rem; text-transform: uppercase; margin-bottom: 4px;">${s.socio || ''}</div>
                                        <div class="text-sm font-medium text-muted" style="display:flex; align-items:center; gap: 6px;">
                                            <i class="fas fa-id-card" style="font-size: 0.8rem; opacity: 0.5;"></i> 
                                            ${s.cedula}
                                        </div>
                                    </div>
                                    ${!activo ? '<span class="badge badge-danger" style="font-size: 0.65rem; padding: 4px 8px; border-radius: 4px;">Retirado</span>' : '<i class="fas fa-chevron-right text-muted" style="font-size: 0.8rem; opacity: 0.5;"></i>'}
                                </div>
                                ${desde}
                                <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: ${activo ? 'var(--primary-color)' : '#ef4444'}; opacity: 0.1;"></div>
                            </button>
                        `;
        }).join('')}
                </div>
            </div>
        `;

        localResults.querySelectorAll('button[data-cedula]').forEach(btn => {
            btn.addEventListener('click', () => {
                const cedula = btn.getAttribute('data-cedula');
                if (!cedula) return;
                searchInput.value = cedula;
                localResults.innerHTML = '';
                searchInput.focus();
                // Auto-consultar al seleccionar
                consultar();
            });
        });
    }

    function findSocioFromInput(text) {
        const query = String(text || '').trim();
        const list = getSociosQuickList();
        if (!list.length) return { error: 'No hay cache de socios. Abre el módulo Socios una vez para generar el cache.', socio: null, matches: [] };

        if (looksLikeCedula(query)) {
            const socio = list.find(s => String(s.cedula) === query);
            if (!socio) return { error: 'Cédula no encontrada en el cache.', socio: null, matches: [] };
            return { error: null, socio, matches: [] };
        }

        const qn = normalizeText(query);
        if (!qn) return { error: 'Escribe una cédula o nombre.', socio: null, matches: [] };
        const matches = list.filter(s => {
            const name = normalizeText(s.socio);
            const ced = normalizeText(s.cedula);
            return name.includes(qn) || ced.includes(qn);
        });
        if (matches.length === 1) return { error: null, socio: matches[0], matches: [] };
        if (matches.length === 0) return { error: 'No hay coincidencias en el cache.', socio: null, matches: [] };
        return { error: 'Hay varias coincidencias. Selecciona una.', socio: null, matches };
    }

    function renderMensualidadItems(items) {
        if (!items || items.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="text-center p-4">No hay mensualidades para mostrar</td></tr>`;
            return;
        }

        body.innerHTML = items.map(it => {
            const pendienteTxt = (it.pendienteMonto != null)
                ? `$${formatMoney(it.pendienteMonto)}`
                : (it.pendienteDisplay || '—');

            const feeTxt = (it.feePerLote != null && Number(it.feePerLote) > 0)
                ? `$${formatMoney(it.feePerLote)}`
                : '-';

            const canPay = it.kind === 'pendiente' && mensState.socioActivo;
            const disabledAttr = canPay ? '' : 'disabled';
            const actionText = !mensState.socioActivo ? 'Bloqueado' : (it.kind === 'pendiente' ? 'Cobrar' : '—');

            return `
                <tr>
                    <td>${it.year}</td>
                    <td>${feeTxt}</td>
                    <td style="max-width: 280px; white-space: normal;">${it.detail}</td>
                    <td>${pendienteTxt}</td>
                    <td>
                        <button type="button" class="btn btn-primary btn-sm" data-item="${it.key}" ${disabledAttr}>
                            ${actionText}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        body.querySelectorAll('button[data-item]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!mensState.socio) return;
                if (!mensState.socioActivo) {
                    setInlineMessage(msgEl, 'Socio retirado: no se pueden registrar cobros.', 'error');
                    return;
                }
                const key = btn.getAttribute('data-item');
                const it = (mensState.items || []).find(x => x.key === key);
                if (!it || it.kind !== 'pendiente') return;

                mensState.selectedPago = it;
                const pendTxt = it.pendienteMonto != null ? formatMoney(it.pendienteMonto) : '—';
                seleccionInfo.textContent = `Seleccionado: Año ${it.year} (${it.detail}). Pendiente: $${pendTxt}`;

                // Defaults
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth() + 1;

                // Suggest paying full year; if current year, suggest current month.
                const suggestedHasta = (it.year === currentYear) ? currentMonth : 12;
                hastaMesEl.value = String(suggestedHasta);

                // If already paid through some month, suggest 12.
                if (it.paidThroughMonth && it.paidThroughMonth > 0) {
                    hastaMesEl.value = '12';
                }

                // Always compute monto based on selected hastaMes
                const amount = computeAmountForYearItem(it, Number(hastaMesEl.value), mensState.loteCount);
                montoEl.value = String(Number(amount || 0).toFixed(2));
                submitBtn.disabled = false;
                setInlineMessage(pagoMsg, '', '');
            });
        });
    }

    async function consultar() {
        setInlineMessage(msgEl, '', '');
        setInlineMessage(pagoMsg, '', '');
        resetSelection();
        body.innerHTML = `<tr><td colspan="5" class="text-center p-4">Consultando...</td></tr>`;
        setDashboardVisible(false);

        const { error, socio, matches } = findSocioFromInput(searchInput.value);
        if (matches && matches.length) {
            renderLocalMatches(matches);
        } else {
            localResults.innerHTML = '';
        }
        if (error) {
            socioInfo.style.display = 'none';
            body.innerHTML = `<tr><td colspan="5" class="text-center p-4">—</td></tr>`;
            setInlineMessage(msgEl, error, 'error');
            return;
        }

        mensState.socio = socio;
        mensState.socioActivo = isSocioActivoValue(socio.estado);
        
        await withLoader('Consultando mensualidades...', async () => {
            try {
                mensState.tipos = await fetchTiposPago();
                const mensualidadTipos = mensState.tipos.filter(t => {
                    const codigo = String(t.codigo || '').toUpperCase().trim();
                    const desc = normalizeText(t.descripcion);
                    return codigo === 'MENSUALIDAD' || desc.includes('mensual');
                });

                if (!mensualidadTipos.length) {
                    mensState.mensualidadTipoIds = [];
                    mensState.pagos = [];
                    body.innerHTML = `<tr><td colspan="5" class="text-center p-4">No existe un tipo de pago de mensualidad. Crea un tipo con código "MENSUALIDAD".</td></tr>`;
                    return;
                }

                mensState.mensualidadTipoIds = mensualidadTipos.map(t => Number(t.id)).filter(n => Number.isFinite(n));
                const primaryTipo = mensualidadTipos[0];
                mensState.mensualidadTipoMontoBase = primaryTipo?.monto_base ?? null;
                mensState.tarifasPorAnio = await fetchTipoPagoTarifasPorAnio(primaryTipo.id);
                mensState.pagos = await fetchPagosBasePorSocio(mensState.socio.cedula, mensState.mensualidadTipoIds);

                const regData = await safeSelectSingle('unoric_regularizacion_estado', 'regularizado_hasta_anio, regularizado_hasta_fecha', 'cedula_socio', mensState.socio.cedula);
                const regularizacion = regData ? { anio: regData.regularizado_hasta_anio, fecha: regData.regularizado_hasta_fecha } : null;

                const lotes = await fetchLotesBySocio(mensState.socio.cedula);
                mensState.loteCount = (lotes || []).length;

                // Actualizar Info del Socio con estilo consistente
                const activo = mensState.socioActivo;
                const statusColor = activo ? '#22c55e' : '#ef4444';
                const statusIcon = activo ? 'fa-check-circle' : 'fa-times-circle';
                const statusText = activo ? 'ACTIVO' : 'RETIRADO';
                
                socioInfo.style.display = 'block';
                socioInfo.style.borderLeft = `4px solid ${statusColor}`;
                socioInfo.style.paddingLeft = '12px';
                socioInfo.style.paddingTop = '8px';
                socioInfo.style.paddingBottom = '8px';
                socioInfo.style.marginBottom = '1.5rem';

                socioInfo.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary-color); text-transform: uppercase;">${mensState.socio.socio}</div>
                        <span class="badge" style="background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}30; font-size: 0.65rem; padding: 4px 8px;">
                            <i class="fas ${statusIcon} mr-1"></i> ${statusText}
                        </span>
                        <span class="badge badge-info" style="font-size: 0.65rem; padding: 4px 8px;">
                            <i class="fas fa-home mr-1"></i> Lotes: ${mensState.loteCount}
                        </span>
                    </div>
                    <div class="text-xs text-muted mt-2" style="display: flex; gap: 12px; align-items: center;">
                        <span><i class="fas fa-id-card mr-1"></i> ${mensState.socio.cedula}</span>
                        ${mensState.socio.socio_desde ? `<span><i class="far fa-calendar-alt mr-1"></i> Desde: <strong>${mensState.socio.socio_desde}</strong></span>` : ''}
                    </div>
                `;

                mensState.items = buildMensualidadItems(mensState.pagos, mensState.loteCount, mensState.tarifasPorAnio, mensState.mensualidadTipoMontoBase, mensState.socio.socio_desde, regularizacion);
                renderMensualidadItems(mensState.items);

                updateDashboard();

                applySocioActivoGates();
            } catch (e) {
                console.error(e);
                body.innerHTML = `<tr><td colspan="5" class="text-center p-4">Error consultando: ${e.message}</td></tr>`;
                setInlineMessage(msgEl, `Error consultando: ${e.message}`, 'error');
            }
        });
    }

    // Local search (no DB)
    function localSearchPreview() {
        const q = String(searchInput.value || '').trim();
        if (!q) {
            localResults.innerHTML = '';
            return;
        }
        const list = getSociosQuickList();
        if (!list.length) {
            setInlineMessage(msgEl, 'No hay cache de socios. Abre el módulo Socios una vez para generar el cache.', 'error');
            return;
        }
        setInlineMessage(msgEl, '', '');
        const qn = normalizeText(q);
        const matches = list.filter(s => normalizeText(s.socio).includes(qn) || String(s.cedula).includes(qn));
        renderLocalMatches(matches);
    }

    let autoTimer = null;
    function scheduleAutoConsultar() {
        if (autoTimer) clearTimeout(autoTimer);
        autoTimer = setTimeout(() => {
            const q = String(searchInput.value || '').trim();
            if (!q) return;
            // Si es cédula exacta y existe en cache, consultar automáticamente
            if (looksLikeCedula(q)) {
                const list = getSociosQuickList();
                const found = list.find(s => String(s.cedula) === q);
                if (found) consultar();
            }
        }, 250);
    }

    searchInput.addEventListener('input', () => {
        localSearchPreview();
        scheduleAutoConsultar();
    });

    hastaMesEl.addEventListener('change', () => {
        if (!mensState.selectedPago || mensState.selectedPago.kind !== 'pendiente') return;
        const it = mensState.selectedPago;
        const amount = computeAmountForYearItem(it, Number(hastaMesEl.value), mensState.loteCount);
        montoEl.value = String(Number(amount || 0).toFixed(2));
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setInlineMessage(pagoMsg, '', '');
        if (!mensState.socio) {
            setInlineMessage(pagoMsg, 'Selecciona un socio primero.', 'error');
            return;
        }
        if (!mensState.socioActivo) {
            setInlineMessage(pagoMsg, 'Socio retirado: no se pueden registrar cobros.', 'error');
            return;
        }
        if (!mensState.selectedPago) {
            setInlineMessage(pagoMsg, 'Selecciona un año pendiente.', 'error');
            return;
        }

        if (mensState.selectedPago.kind !== 'pendiente') {
            setInlineMessage(pagoMsg, 'Selecciona un año pendiente.', 'error');
            return;
        }

        const hastaMes = Number(hastaMesEl.value);
        if (!hastaMes || hastaMes < 1 || hastaMes > 12) {
            setInlineMessage(pagoMsg, 'Selecciona el mes hasta el que se pagará (1-12).', 'error');
            return;
        }

        const yaPagado = Number(mensState.selectedPago.paidThroughMonth || 0);
        if (hastaMes <= yaPagado) {
            setInlineMessage(pagoMsg, `Este año ya está pagado hasta el mes ${yaPagado}. Selecciona un mes mayor.`, 'error');
            return;
        }

        const montoNum = Number(montoEl.value);
        if (!montoNum || montoNum <= 0) {
            setInlineMessage(pagoMsg, 'Monto inválido.', 'error');
            return;
        }

        await withLoader('Registrando cobro...', async () => {
            try {
                const client = getSupabaseClient();
                const y = mensState.selectedPago.year;
                const desde = `${y}-01-01`;
                const hasta = `${y}-${String(hastaMes).padStart(2, '0')}-${String(lastDayOfMonth(y, hastaMes)).padStart(2, '0')}`;

                const tipoId = mensState.mensualidadTipoIds?.[0];
                if (!tipoId) throw new Error('Tipo de mensualidad no disponible.');

                const estadoPago = hastaMes >= 12 ? 'PAGADO' : 'PENDIENTE';

                let pagoId = mensState.selectedPago.pagoId;
                if (pagoId) {
                    const updatePayload = {
                        periodo_desde: desde,
                        periodo_hasta: hasta,
                        monto_esperado: montoNum,
                        estado: estadoPago
                    };
                    const { error: updErr } = await client
                        .from('unoric_pagos')
                        .update(updatePayload)
                        .eq('id', pagoId);
                    if (updErr) throw updErr;
                } else {
                    const pagoPayload = {
                        cedula_socio: mensState.socio.cedula,
                        id_lote: null,
                        tipo_pago_id: tipoId,
                        descripcion: `Mensualidad ${y}`,
                        monto_esperado: montoNum,
                        periodo_desde: desde,
                        periodo_hasta: hasta,
                        estado: estadoPago,
                        created_by: currentUser?.id
                    };

                    const { data: pagoRow, error: pagoErr } = await client
                        .from('unoric_pagos')
                        .insert([pagoPayload])
                        .select('id')
                        .single();
                    if (pagoErr) throw pagoErr;
                    pagoId = pagoRow.id;
                }

                // Also create a registro for auditoría (si RLS lo permite)
                const regPayload = {
                    pago_id: pagoId,
                    fecha_pago: fechaEl.value || todayISODate(),
                    monto: montoNum,
                    referencia: (refEl.value || '').trim() || null,
                    observaciones: (obsEl.value || '').trim() || null,
                    created_by: currentUser?.id
                };
                const { error: regErr } = await client.from('unoric_pagos_registros').insert([regPayload]);
                if (regErr) throw regErr;

                setInlineMessage(pagoMsg, 'Cobro registrado correctamente.', 'success');
                refEl.value = '';
                obsEl.value = '';

                // Refresh
                mensState.pagos = await fetchPagosBasePorSocio(mensState.socio.cedula, mensState.mensualidadTipoIds);
                mensState.items = buildMensualidadItems(mensState.pagos, mensState.loteCount, mensState.tarifasPorAnio, mensState.mensualidadTipoMontoBase, mensState.socio.socio_desde);
                renderMensualidadItems(mensState.items);
                resetSelection();
            } catch (err) {
                console.error(err);
                setInlineMessage(pagoMsg, `Error registrando cobro: ${err.message}`, 'error');
            }
        });
    });
}

function filterSocios(searchTerm, etapa, estado) {
    const term = searchTerm.toLowerCase();

    filteredSocios = allSocios.filter(socio => {
        // Search Filter
        const matchesSearch = socio.socio.toLowerCase().includes(term) || socio.cedula.includes(term);

        // Etapa Filter
        let matchesEtapa = true;
        if (etapa !== 'all') {
            // Check if ANY of the socio's lotes match the selected etapa
            matchesEtapa = socio.lotes.some(l => l.etapa.toString() === etapa);
        }

        // Estado Filter
        let matchesEstado = true;
        if (estado === 'ok') {
            matchesEstado = !socio.needsUpdate;
        } else if (estado === 'update') {
            matchesEstado = socio.needsUpdate;
        }

        return matchesSearch && matchesEtapa && matchesEstado;
    });

    renderSociosTable(filteredSocios);
}

function renderSociosTable(socios) {
    const tableBody = document.getElementById('socios-table-body');

    if (socios.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4">No se encontraron resultados</td></tr>`;
        return;
    }

    // Limit render for performance (first 100)
    const displaySocios = socios.slice(0, 100);

    tableBody.innerHTML = displaySocios.map(socio => {
        // Lotes Tags
        const lotesHtml = socio.lotes.length > 0
            ? socio.lotes.map(l => `<span class="lote-tag" title="Etapa ${l.etapa}">Lote ${l.lote} (E${l.etapa})</span>`).join('')
            : '<span class="text-muted text-sm">Sin lotes</span>';

        // Status Badge
        const activo = isSocioActivoValue(socio.estado);
        let statusBadge = '';
        if (!activo) {
            statusBadge = `<span class="badge badge-danger">Retirado</span>`;
        } else if (socio.needsUpdate) {
            statusBadge = `<span class="badge badge-warning">Requiere Actualización</span>`;
        } else if (socio.hasLotes) {
            statusBadge = `<span class="badge badge-success">Activo</span>`;
        } else {
            statusBadge = `<span class="badge badge-info">Activo (Sin Lotes)</span>`;
        }

        // Contact Info with warnings
        const phoneClass = (socio.hasLotes && socio.invalidPhone) ? 'warning' : '';
        const emailClass = (socio.hasLotes && socio.invalidEmail) ? 'warning' : '';

        const phoneIcon = (socio.hasLotes && socio.invalidPhone) ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-phone"></i>';
        const emailIcon = (socio.hasLotes && socio.invalidEmail) ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-envelope"></i>';

        return `
            <tr>
                <td>
                    <div class="socio-name">${socio.socio}</div>
                    <div class="socio-cedula"><i class="far fa-id-card"></i> ${socio.cedula}</div>
                </td>
                <td>
                    <div class="contact-info">
                        <div class="contact-item ${phoneClass}">
                            ${phoneIcon} ${socio.celular}
                        </div>
                        <div class="contact-item ${emailClass}">
                            ${emailIcon} ${socio.correo}
                        </div>
                    </div>
                </td>
                <td>
                    <div style="max-width: 250px; white-space: normal;">
                        ${lotesHtml}
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-primary btn-sm" data-edit-socio="${socio.cedula}">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Bind edit buttons
    tableBody.querySelectorAll('button[data-edit-socio]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cedula = btn.getAttribute('data-edit-socio');
            if (cedula) openSocioModal(cedula);
        });
    });
}

// ==========================================
// LOTES MODULE LOGIC
// ==========================================

async function initLotesModule() {
    const tableBody = document.getElementById('lotes-table-body');
    const totalLotesEl = document.getElementById('total-lotes');
    const lotesSinSocioEl = document.getElementById('lotes-sin-socio');
    const lotesPromesaEl = document.getElementById('lotes-promesa');
    const lotesIncompleteEl = document.getElementById('lotes-incomplete');
    const searchInput = document.getElementById('search-lotes');
    const filterEtapa = document.getElementById('filter-lote-etapa');
    const filterEstado = document.getElementById('filter-lote-estado');

    // Cards para filtrado rápido
    const cardTotal = document.getElementById('card-total-lotes');
    const cardSinSocio = document.getElementById('card-lotes-sin-socio');
    const cardPromesa = document.getElementById('card-lotes-promesa');
    const cardIncomplete = document.getElementById('card-lotes-incomplete');

    // Botón Nuevo Lote
    const btnNuevo = document.getElementById('btn-nuevo-lote');
    const modalLote = document.getElementById('modal-lote');
    const formLote = document.getElementById('form-lote');
    const closeLote = document.getElementById('close-modal-lote');
    const cancelLote = document.getElementById('btn-cancelar-lote');
    const socioSelect = document.getElementById('lote-socio');

    beginLoading('Cargando lotes...');
    try {
        const client = getSupabaseClient();

        // Fetch Lotes
        const { data: lotes, error: lotesError } = await client
            .from('unoric_lotes')
            .select('*')
            .order('lote', { ascending: true });

        if (lotesError) throw lotesError;

        // Fetch Socios
        const { data: socios, error: sociosError } = await client
            .from('unoric_socios')
            .select('cedula, socio, celular, correo')
            .order('socio', { ascending: true });

        if (sociosError) throw sociosError;

        // Llenar select de socios
        if (socioSelect) {
            socioSelect.innerHTML = '<option value="">-- Sin Socio (Disponible) --</option>' +
                socios.map(s => `<option value="${s.cedula}">${s.socio} (${s.cedula})</option>`).join('');
            
            // Auto-completar datos al seleccionar socio
            socioSelect.addEventListener('change', (e) => {
                const cedula = e.target.value;
                const socio = socios.find(s => s.cedula === cedula);
                if (socio) {
                    document.getElementById('lote-celular').value = socio.celular || '';
                    document.getElementById('lote-correo').value = socio.correo || '';
                }
            });
        }

        // Map para lookup rápido
        const sociosMap = new Map(socios.map(s => [s.cedula, s.socio]));

        // Process Data
        allLotes = lotes.map(lote => {
            const socioName = lote.socio ? (sociosMap.get(lote.socio) || 'Socio no encontrado') : 'Disponible';
            const invalidPhone = lote.celular === '999999999' || !lote.celular;
            const invalidEmail = !lote.correo || lote.correo.includes('sin@correo') || lote.correo.includes('actualizar@correo');
            const needsUpdate = lote.socio && (invalidPhone || invalidEmail);

            return {
                ...lote,
                socioName,
                needsUpdate,
                invalidPhone,
                invalidEmail
            };
        });

        // Update Stats
        totalLotesEl.textContent = allLotes.length;
        if (lotesSinSocioEl) lotesSinSocioEl.textContent = allLotes.filter(l => !l.socio).length;
        lotesPromesaEl.textContent = allLotes.filter(l => l.promesa === 'SI').length;
        lotesIncompleteEl.textContent = allLotes.filter(l => l.needsUpdate).length;

        // Initial Render
        filteredLotes = [...allLotes];
        renderLotesTable(filteredLotes);

        // Event Listeners
        searchInput.addEventListener('input', (e) => filterLotes(e.target.value, filterEtapa.value, filterEstado.value));
        filterEtapa.addEventListener('change', (e) => filterLotes(searchInput.value, e.target.value, filterEstado.value));
        filterEstado.addEventListener('change', (e) => filterLotes(searchInput.value, filterEtapa.value, e.target.value));

        // Filtrado rápido por tarjetas
        cardTotal?.addEventListener('click', () => { 
            searchInput.value = ''; filterEtapa.value = 'all'; filterEstado.value = 'all';
            filterLotes('', 'all', 'all');
        });
        cardSinSocio?.addEventListener('click', () => {
             searchInput.value = ''; filterEtapa.value = 'all'; filterEstado.value = 'all';
             filteredLotes = allLotes.filter(l => !l.socio);
             renderLotesTable(filteredLotes);
        });
        cardPromesa?.addEventListener('click', () => {
             searchInput.value = ''; filterEtapa.value = 'all'; filterEstado.value = 'all';
             filteredLotes = allLotes.filter(l => l.promesa === 'SI');
             renderLotesTable(filteredLotes);
        });
        cardIncomplete?.addEventListener('click', () => {
            searchInput.value = ''; filterEtapa.value = 'all'; filterEstado.value = 'all';
            filteredLotes = allLotes.filter(l => l.needsUpdate);
            renderLotesTable(filteredLotes);
        });

        btnNuevo?.addEventListener('click', () => abrirModalLote());
        closeLote?.addEventListener('click', () => modalLote.classList.add('hidden'));
        cancelLote?.addEventListener('click', () => modalLote.classList.add('hidden'));

        formLote?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveLote();
        });

    } catch (error) {
        console.error(error);
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="text-center error-message">Error cargando datos: ${error.message}</td></tr>`;
    } finally {
        endLoading();
    }
}

function abrirModalLote(lote = null) {
    const modal = document.getElementById('modal-lote');
    const title = document.getElementById('modal-lote-title');
    const form = document.getElementById('form-lote');
    const msg = document.getElementById('lote-msg');

    msg.classList.add('hidden');
    form.reset();

    if (lote) {
        title.textContent = 'Editar Lote ' + lote.lote;
        document.getElementById('lote-id-hidden').value = lote.id_lote;
        document.getElementById('lote-etapa').value = lote.etapa;
        document.getElementById('lote-numero').value = lote.lote;
        document.getElementById('lote-socio').value = lote.socio || '';
        document.getElementById('lote-celular').value = lote.celular || '';
        document.getElementById('lote-correo').value = lote.correo || '';
        document.getElementById('lote-promesa').value = lote.promesa || 'NO';
    } else {
        title.textContent = 'Registrar Nuevo Lote';
        document.getElementById('lote-id-hidden').value = '';
    }

    modal.classList.remove('hidden');
}

async function saveLote() {
    const id = document.getElementById('lote-id-hidden').value;
    const etapa = document.getElementById('lote-etapa').value;
    const numero = document.getElementById('lote-numero').value;
    const socio = document.getElementById('lote-socio').value;
    const celular = document.getElementById('lote-celular').value;
    const correo = document.getElementById('lote-correo').value;
    const promesa = document.getElementById('lote-promesa').value;
    const msgEl = document.getElementById('lote-msg');

    const payload = {
        etapa: parseInt(etapa),
        lote: parseInt(numero),
        socio: socio || null,
        celular,
        correo,
        promesa
    };

    await withLoader(id ? 'Actualizando lote...' : 'Registrando lote...', async () => {
        try {
            const client = getSupabaseClient();
            
            // Logica de cambio de propietario: el socio anterior se retira del lote,
            // pero el nuevo dueño puede conservar otros lotes que ya posee.
            let result;
            if (id) {
                const oldLote = allLotes.find(l => l.id_lote === id);
                const oldSocio = oldLote ? oldLote.socio : null;
                const newSocio = payload.socio;

                if (oldSocio !== newSocio) {
                    // Si el lote ya tenía un dueño, confirmar el traspaso
                    if (oldSocio && newSocio) {
                        const ok = await showConfirm('Confirmar Traspaso', 
                            `El Lote ${oldLote.lote} cambiará de propietario (${oldLote.socioName} → ${newSocio}). ¿Desea continuar?`);
                        if (!ok) return;
                    }

                    // 1. Cerrar historial del socio anterior en este lote
                    if (oldSocio) {
                        await client.from('unoric_historial_lotes')
                            .update({ fecha_hasta: new Date().toISOString().split('T')[0], activo: false })
                            .eq('id_lote', id)
                            .eq('cedula_socio', oldSocio)
                            .eq('activo', true);
                    }

                    // 2. Abrir historial del nuevo socio en este lote
                    if (newSocio) {
                        await client.from('unoric_historial_lotes').insert([{
                            id_lote: id,
                            cedula_socio: newSocio,
                            fecha_desde: new Date().toISOString().split('T')[0],
                            activo: true
                        }]);
                    }
                }
                result = await client.from('unoric_lotes').update(payload).eq('id_lote', id).select();
            } else {
                result = await client.from('unoric_lotes').insert([payload]).select();
                const newId = result.data?.[0]?.id_lote;
                if (newId && payload.socio) {
                    // Abrir historial para nuevo lote
                    await client.from('unoric_historial_lotes').insert([{
                        id_lote: newId,
                        cedula_socio: payload.socio,
                        fecha_desde: new Date().toISOString().split('T')[0],
                        activo: true
                    }]);
                }
            }

            if (result.error) throw result.error;

            document.getElementById('modal-lote').classList.add('hidden');
            showAlert('Éxito', id ? 'Lote actualizado correctamente.' : 'Lote registrado correctamente.');
            await initLotesModule(); // Recargar todo

        } catch (err) {
            setInlineMessage(msgEl, err.message, 'error');
        }
    });
}

function filterLotes(searchTerm, etapa, estado) {
    const term = searchTerm.toLowerCase();

    filteredLotes = allLotes.filter(lote => {
        // Search Filter (Lote #, Socio Name, Cedula)
        const matchesSearch =
            lote.lote.toString().includes(term) ||
            lote.socioName.toLowerCase().includes(term) ||
            lote.socio.includes(term);

        // Etapa Filter
        let matchesEtapa = true;
        if (etapa !== 'all') {
            matchesEtapa = lote.etapa.toString() === etapa;
        }

        // Estado Filter
        let matchesEstado = true;
        if (estado === 'ok') {
            matchesEstado = !lote.needsUpdate;
        } else if (estado === 'update') {
            matchesEstado = lote.needsUpdate;
        }

        return matchesSearch && matchesEtapa && matchesEstado;
    });

    renderLotesTable(filteredLotes);
}

function renderLotesTable(lotes) {
    const tableBody = document.getElementById('lotes-table-body');

    if (lotes.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-4">No se encontraron resultados</td></tr>`;
        return;
    }

    // Limit render for performance (first 100)
    const displayLotes = lotes.slice(0, 100);

    tableBody.innerHTML = displayLotes.map(lote => {
        // Etapa Badge Class
        const etapaClass = `etapa-${lote.etapa}`;

        // Promesa Class
        const promesaClass = lote.promesa === 'SI' ? 'promesa-si' : 'promesa-no';
        const promesaIcon = lote.promesa === 'SI' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>';

        // Status Badge
        let statusBadge = '';
        if (lote.needsUpdate) {
            statusBadge = `<span class="badge badge-danger">Requiere Actualización</span>`;
        } else {
            statusBadge = `<span class="badge badge-success">Datos Completos</span>`;
        }

        // Contact Info with warnings
        const phoneClass = lote.invalidPhone ? 'warning' : '';
        const emailClass = lote.invalidEmail ? 'warning' : '';

        const phoneIcon = lote.invalidPhone ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-phone"></i>';
        const emailIcon = lote.invalidEmail ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-envelope"></i>';

        const btnLabel = lote.socio ? 'Editar' : 'Asignar Socio';
        const btnClass = lote.socio ? 'btn-primary' : 'btn-success';
        const btnIcon = lote.socio ? 'fa-edit' : 'fa-user-plus';

        return `
            <tr>
                <td>
                    <div class="etapa-badge ${etapaClass}">
                        Etapa ${lote.etapa}
                    </div>
                    <div class="lote-number mt-1">Lote ${lote.lote}</div>
                </td>
                <td>
                    <div class="socio-name">${lote.socioName}</div>
                    <div class="socio-cedula"><i class="far fa-id-card"></i> ${lote.socio || 'Sin asignar'}</div>
                </td>
                <td>
                    <div class="contact-info">
                        <div class="contact-item ${phoneClass}">
                            ${phoneIcon} ${lote.celular || '---'}
                        </div>
                        <div class="contact-item ${emailClass}">
                            ${emailIcon} ${lote.correo || '---'}
                        </div>
                    </div>
                </td>
                <td>
                    <span class="${promesaClass}">
                        ${promesaIcon} ${lote.promesa}
                    </span>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn ${btnClass} btn-sm btn-edit-lote" data-id="${lote.id_lote}">
                        <i class="fas ${btnIcon}"></i> ${btnLabel}
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach event listeners to edit buttons
    tableBody.querySelectorAll('.btn-edit-lote').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const lote = allLotes.find(l => l.id_lote === id);
            if (lote) abrirModalLote(lote);
        });
    });
}

// ==========================================
// CONVOCATORIAS MODULE
// ==========================================
let evoState = {
    eventos: [],
    selectedEvento: null,
    asistencias: []
};

async function initConvocatoriasModule() {
    const btnNueva = document.getElementById('btn-nueva-convocatoria');
    const eventosBody = document.getElementById('eventos-body');
    const modalEvo = document.getElementById('modal-evento');
    const formEvo = document.getElementById('form-evento');
    const closeEvo = document.getElementById('close-modal-evento');
    const cancelEvo = document.getElementById('btn-cancelar-evento');
    const msgEl = document.getElementById('evento-msg');

    const alcanceSelect = document.getElementById('evo-alcance');
    const manualContainer = document.getElementById('manual-selection-container');
    const manualSearch = document.getElementById('manual-socio-search');
    const manualList = document.getElementById('manual-socios-list');
    const alfaContainer = document.getElementById('alfa-range-container');

    const seccionAsistencia = document.getElementById('seccion-asistencia');
    const asistenciaBody = document.getElementById('asistencia-body');
    const btnVolverEvos = document.getElementById('btn-volver-eventos');
    const searchAsis = document.getElementById('asistencia-search');
    const btnFinalizar = document.getElementById('btn-finalizar-evento');
    const btnDescargar = document.getElementById('btn-descargar-asistencia');

    await loadEventos();

    // Permitir actualización externa (poller) para el listado de eventos
    window.refreshConvocatorias = async () => {
        if (currentViewName === 'convocatorias') {
            await loadEventos();
        }
    };

    // Auto-abrir evento si venimos de un botón "VIVO"
    if (window.autoOpenEventoId) {
        const targetId = window.autoOpenEventoId;
        window.autoOpenEventoId = null; // Limpiar
        const ev = evoState.eventos.find(ex => ex.id === targetId);
        if (ev) abrirControlAsistencia(ev);
    }

    btnNueva?.addEventListener('click', () => {
        formEvo.reset();
        document.getElementById('evo-fecha').value = todayISODate();
        document.getElementById('evo-hora-inicio').value = '08:00';
        document.getElementById('evo-hora-lista').value = '08:15';
        if (alcanceSelect) alcanceSelect.value = 'GENERAL';
        manualContainer?.classList.add('hidden');
        alfaContainer?.classList.add('hidden');
        modalEvo?.classList.remove('hidden');
    });

    alcanceSelect?.addEventListener('change', () => {
        const val = alcanceSelect.value;
        manualContainer?.classList.toggle('hidden', val !== 'MANUAL');
        alfaContainer?.classList.toggle('hidden', val !== 'ALFABETICO');
        
        if (val === 'MANUAL') {
            renderManualSociosList();
        }
    });

    manualSearch?.addEventListener('input', () => {
        renderManualSociosList(manualSearch.value);
    });

    function renderManualSociosList(filtro = '') {
        const socios = getSociosQuickList();
        const f = normalizeText(filtro);
        
        const filtered = socios.filter(s => 
            normalizeText(s.socio).includes(f) || 
            s.cedula.includes(f)
        );

        if (manualList) {
            manualList.innerHTML = filtered.map(s => `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; padding: 4px; border-bottom: 1px solid #f0f0f0; cursor: pointer;">
                    <input type="checkbox" name="manual-socio" value="${s.cedula}">
                    <span class="truncate" title="${s.socio}">${s.socio}</span>
                </label>
            `).join('');
        }
    }

    closeEvo?.addEventListener('click', () => modalEvo.classList.add('hidden'));
    cancelEvo?.addEventListener('click', () => modalEvo.classList.add('hidden'));

    formEvo?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveEvento();
    });

    btnVolverEvos?.addEventListener('click', () => {
        seccionAsistencia?.classList.add('hidden');
        document.querySelector('.card.mb-6')?.classList.remove('hidden');
        btnNueva?.parentElement?.parentElement?.classList.remove('hidden');
    });

    searchAsis?.addEventListener('input', () => {
        renderAsistencias(searchAsis.value.trim());
    });

    btnFinalizar?.addEventListener('click', async () => {
        if (!evoState.selectedEvento) return;
        
        const ok = await showConfirm(`Finalizar ${evoState.selectedEvento.tipo}`, 
            `Esto cerrará la lista permanentemente y generará multas de $${evoState.selectedEvento.multa_ausencia} a los ausentes. ¿Continuar?`);
        
        if (!ok) return;

        await withLoader('Finalizando evento y procesando multas...', async () => {
            try {
                if (evoState.selectedEvento.multa_ausencia > 0) {
                    const ausentes = evoState.asistencias.filter(x => x.estado === 'AUSENTE');
                    await procesarMultasEventos(evoState.selectedEvento, ausentes);
                }

                const client = getSupabaseClient();
                const { error } = await client.from('unoric_eventos').update({ estado: 'FINALIZADO' }).eq('id', evoState.selectedEvento.id);
                if (error) throw error;

                evoState.selectedEvento.estado = 'FINALIZADO';
                showAlert('Éxito', 'Evento finalizado y multas generadas.');
                btnVolverEvos?.click();
                await loadEventos();
                updateLiveEventButtons();
            } catch (err) {
                console.error(err);
                showAlert('Error', 'Hubo un problema al finalizar el evento: ' + err.message);
            }
        });
    });

    btnDescargar?.addEventListener('click', async () => {
        if (!evoState.selectedEvento) return;
        await exportAsistenciaPDF(evoState.selectedEvento, evoState.asistencias);
    });

    async function loadEventos() {
        const client = getSupabaseClient();
        const { data, error } = await client
            .from('unoric_eventos')
            .select('*')
            .order('fecha', { ascending: false })
            .order('hora_inicio', { ascending: false });
        
        if (error) {
            console.error(error);
            return;
        }

        evoState.eventos = data || [];
        renderEventos();
    }

    async function exportAsistenciaPDF(evento, asistencias) {
        await withLoader('Generando Acta de Asistencia...', async () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 15; 
            const logoUrl = 'https://i.ibb.co/rRLTLtty/Gemini-Generated-Image-yqe70kyqe70kyqe7.png';

            // --- HEADER ---
            try {
                // Usamos formato PNG con canal alfa para transparencia real
                doc.addImage(logoUrl, 'PNG', margin, 10, 22, 22, undefined, 'FAST');
            } catch (e) { 
                console.error('Logo error:', e); 
            }

            doc.setTextColor(2, 48, 185); // Institucional Blue
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text("UNORIC R.Q.E - '4 DE JULIO'", pageWidth / 2, 22, { align: 'center' });
            
            doc.setFontSize(14);
            doc.text('ACTA DE CONTROL DE ASISTENCIA', pageWidth / 2, 31, { align: 'center' });
            
            doc.setDrawColor(2, 48, 185);
            doc.setLineWidth(0.5);
            doc.line(margin, 38, pageWidth - margin, 38);

            // --- EVENT DETAILS ---
            doc.setTextColor(60, 60, 60);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('DATOS DEL EVENTO', margin, 48);
            
            doc.setFont('helvetica', 'normal');
            doc.text(`TIPO:`, margin, 55);
            doc.setFont('helvetica', 'bold');
            doc.text(`${evento.tipo}`, margin + 35, 55);
            
            doc.setFont('helvetica', 'normal');
            doc.text(`MOTIVO:`, margin, 60);
            doc.setFont('helvetica', 'bold');
            doc.text(`${evento.descripcion}`, margin + 35, 60);

            doc.setFont('helvetica', 'normal');
            doc.text(`FECHA:`, margin, 65);
            doc.setFont('helvetica', 'bold');
            doc.text(`${formatDateLong(evento.fecha)}`, margin + 35, 65);

            doc.setFont('helvetica', 'normal');
            doc.text(`HORARIO:`, margin, 70);
            doc.setFont('helvetica', 'bold');
            doc.text(`${evento.hora_inicio} (Toma de lista: ${evento.hora_toma_lista})`, margin + 35, 70);

            doc.setFont('helvetica', 'normal');
            doc.text(`ALCANCE:`, margin, 75);
            doc.setFont('helvetica', 'bold');
            doc.text(`${evento.alcance}`, margin + 35, 75);

            doc.setFont('helvetica', 'normal');
            doc.text(`VALOR MULTA:`, margin, 80);
            doc.setFont('helvetica', 'bold');
            const multaTexto = evento.multa_ausencia > 0 ? `$${evento.multa_ausencia}` : 'Sin multa';
            doc.text(multaTexto, margin + 35, 80);

            // --- SUMMARY BOX ---
            const stats = {
                P: asistencias.filter(x => x.estado === 'PUNTUAL').length,
                A: asistencias.filter(x => x.estado === 'ATRASADO').length,
                J: asistencias.filter(x => x.estado === 'JUSTIFICADO').length,
                U: asistencias.filter(x => x.estado === 'AUSENTE').length,
                T: asistencias.length
            };

            doc.setFillColor(245, 247, 251);
            doc.rect(pageWidth - 85, 45, 65, 38, 'F');
            doc.setFontSize(9);
            doc.setTextColor(2, 48, 185);
            doc.setFont('helvetica', 'bold');
            doc.text('RESUMEN ESTADÍSTICO', pageWidth - 80, 52);
            
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            doc.text(`PRESENTES:   ${stats.P}`, pageWidth - 80, 58);
            doc.text(`ATRASADOS:   ${stats.A}`, pageWidth - 80, 63);
            doc.text(`JUSTIFICADOS: ${stats.J}`, pageWidth - 80, 68);
            doc.text(`AUSENTES:     ${stats.U}`, pageWidth - 80, 73);
            doc.text(`TOTAL:        ${stats.T}`, pageWidth - 80, 79);

            // --- TABLE OF ATTENDEES ---
            const list = getSociosQuickList();
            const categories = [
                { title: 'PRESENTES / PUNTUALES', status: 'PUNTUAL', color: [16, 185, 129] },
                { title: 'ATRASOS', status: 'ATRASADO', color: [245, 158, 11] },
                { title: 'JUSTIFICADOS', status: 'JUSTIFICADO', color: [59, 130, 246] },
                { title: 'AUSENCIAS', status: 'AUSENTE', color: [239, 68, 68] }
            ];

            let finalY = 88;

            for (const cat of categories) {
                const filtered = asistencias.filter(x => x.estado === cat.status).map(as => {
                    const socio = list.find(s => s.cedula === as.cedula_socio);
                    return [
                        as.cedula_socio,
                        socio?.socio || 'N/A',
                        as.hora_llegada ? new Date(as.hora_llegada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
                        as.estado
                    ];
                });

                if (filtered.length > 0) {
                    doc.autoTable({
                        startY: finalY + 5,
                        head: [[{ content: cat.title, colSpan: 4, styles: { fillColor: cat.color, halign: 'center' } }],
                               ['Cédula', 'Socio', 'H. Llegada', 'Observación']],
                        body: filtered,
                        theme: 'striped',
                        headStyles: { fillColor: [40, 40, 40], fontSize: 9 },
                        styles: { fontSize: 8, cellPadding: 2 },
                        columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 30 }, 3: { cellWidth: 30 } }
                    });
                    finalY = doc.lastAutoTable.finalY + 5;
                }
            }

            // --- FOOTER / SIGNATURES ---
            if (finalY > 250) { doc.addPage(); finalY = 20; }
            
            const sigY = finalY + 25;
            doc.line(margin + 10, sigY, margin + 70, sigY);
            doc.text('PRESIDENTE / SECRETARIO', margin + 40, sigY + 5, { align: 'center' });
            
            doc.line(pageWidth - margin - 70, sigY, pageWidth - margin - 10, sigY);
            doc.text('RESPONSABLE DE ACTA', pageWidth - margin - 40, sigY + 5, { align: 'center' });

            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            const footerText = `Documento generado por Sistema UNORIC - ${new Date().toLocaleString()}`;
            doc.text(footerText, pageWidth / 2, 285, { align: 'center' });

            doc.save(`ACTA_${evento.tipo}_${evento.fecha}.pdf`);
        });
    }

    function renderEventos() {
        if (evoState.eventos.length === 0) {
            eventosBody.innerHTML = '<tr><td colspan="5" class="text-center p-8">No hay eventos registrados.</td></tr>';
            return;
        }

        const now = new Date();

        eventosBody.innerHTML = evoState.eventos.map(ev => {
            // Determinar estado efectivo basado en fecha/hora
            let effectiveStatus = ev.estado;
            if (effectiveStatus !== 'FINALIZADO' && effectiveStatus !== 'CANCELADO') {
                const eventDateTime = new Date(`${ev.fecha}T${ev.hora_inicio}`);
                if (now >= eventDateTime) {
                    effectiveStatus = 'EN_CURSO';
                }
            }

            const statusClass = effectiveStatus === 'FINALIZADO' ? 'badge-success' : 
                               (effectiveStatus === 'CANCELADO' ? 'badge-danger' : 
                               (effectiveStatus === 'EN_CURSO' ? 'badge-info' : 'badge-warning'));
            const statusText = effectiveStatus.replace('_', ' ');

            const iconMap = {
                'MINGA': 'fa-tools',
                'ASAMBLEA': 'fa-users',
                'SESIÓN': 'fa-briefcase',
                'SESIÓN EXTRAORDINARIA': 'fa-gavel',
                'EVENTO SOCIAL': 'fa-glass-cheers'
            };
            const icon = iconMap[ev.tipo] || 'fa-handshake';

            return `
                <tr>
                    <td>
                        <div class="font-bold">${ev.fecha}</div>
                        <div class="text-xs text-muted"><i class="far fa-clock"></i> ${ev.hora_inicio}</div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 35px; height: 35px; border-radius: 8px; background: rgba(2,48,185,0.1); color: var(--primary-color); display: flex; align-items: center; justify-content: center;">
                                <i class="fas ${icon}"></i>
                            </div>
                            <div>
                                <div class="font-bold text-primary">${ev.tipo}</div>
                                <div class="text-sm">${ev.descripcion}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="badge" style="background:#e0e7ff; color:#4338ca; font-size: 0.65rem;">${ev.alcance}</span></td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <div style="display: flex; gap: 5px;">
                            ${effectiveStatus === 'PENDIENTE' ? `
                                <button class="btn btn-secondary btn-sm btn-cancelar-evento" data-id="${ev.id}" title="Cancelar Evento" style="padding: 6px 10px; font-size: 0.75rem; color: #dc2626; border-color: #fca5a5;">
                                    <i class="fas fa-ban"></i>
                                </button>
                            ` : ''}
                            ${effectiveStatus !== 'CANCELADO' ? `
                                <button class="btn btn-primary btn-sm btn-gestion-asistencia" data-id="${ev.id}" style="padding: 6px 12px; font-size: 0.75rem;">
                                    <i class="fas fa-clipboard-list mr-1"></i>${ev.estado === 'PENDIENTE' ? 'Iniciar Lista' : 'Gestionar'}
                                </button>
                            ` : ''}
                            <button class="btn btn-secondary btn-sm btn-share-whatsapp" data-id="${ev.id}" style="padding: 6px 10px; font-size: 0.75rem; border-color: #25D366; color: #128C7E;">
                                <i class="fab fa-whatsapp"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        eventosBody.querySelectorAll('.btn-gestion-asistencia').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const evento = evoState.eventos.find(e => e.id === id);
                if (evento) abrirControlAsistencia(evento);
            });
        });

        eventosBody.querySelectorAll('.btn-cancelar-evento').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const evento = evoState.eventos.find(e => e.id === id);
                if (evento) {
                    if (confirm(`¿Estás seguro de que deseas cancelar la convocatoria: ${evento.descripcion}?`)) {
                        await cancelarEvento(evento.id);
                    }
                }
            });
        });

        eventosBody.querySelectorAll('.btn-share-whatsapp').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const evento = evoState.eventos.find(e => e.id === id);
                if (evento) shareEventoWhatsApp(evento);
            });
        });
    }

    async function shareEventoWhatsApp(evento) {
        if (evento.estado === 'FINALIZADO') {
            showAlert('Aviso', 'No se pueden enviar recordatorios de eventos que ya han finalizado.', 'info');
            return;
        }

        const now = new Date();
        
        // Parseo robusto de fecha y hora local
        const [y, mm_orig, d] = evento.fecha.split('-').map(Number);
        const [hh, min] = evento.hora_inicio.split(':').map(Number);
        const eventDateTime = new Date(y, mm_orig - 1, d, hh, min);
        
        const isEnCurso = (evento.estado === 'PENDIENTE' && now >= eventDateTime);

        const fechaLong = formatDateLong(evento.fecha);
        const tipoEmos = {
            'MINGA': '🛠️',
            'ASAMBLEA': '👥',
            'SESIÓN': '💼',
            'SESIÓN EXTRAORDINARIA': '🚨',
            'EVENTO SOCIAL': '🎉'
        };
        const emoj = tipoEmos[evento.tipo] || '📢';
        
        let msg = '';
        if (evento.estado === 'CANCELADO') {
            msg = `*AVISO: CONVOCATORIA CANCELADA* ❌\n`;
            msg += `------------------------------------------\n\n`;
            msg += `Se informa que la *${evento.tipo}* programada para el día _${fechaLong}_ ha sido *CANCELADA* hasta nuevo aviso.\n\n`;
            msg += `📌 *Motivo:* ${evento.descripcion}\n\n`;
            msg += `Sentimos los inconvenientes causados. 🙌`;
            
            const encoded = encodeURIComponent(msg);
            window.open(`https://wa.me/?text=${encoded}`, '_blank');
            return;
        }

        if (isEnCurso) {
            msg = `*RECORDATORIO: ${evento.tipo} EN CURSO* 🔴\n`;
            msg += `------------------------------------------\n\n`;
            msg += `Se está llevando a cabo la *${evento.tipo}* que fue convocada para hoy. Si aún no ha llegado, le recordamos los detalles para su pronta asistencia:\n\n`;
        } else {
            msg = `*CONVOCATORIA: ${evento.tipo}* ${emoj}\n`;
            msg += `------------------------------------------\n\n`;
            msg += `Se convoca de carácter urgente a la *${evento.tipo}* que se llevará a cabo el día _${fechaLong}_.\n\n`;
        }
        
        // Determinar alcance natural
        let alcanceTexto = '';
        const verbo = isEnCurso ? 'convocó' : 'convoca';
        
        if (evento.alcance === 'GENERAL') {
            alcanceTexto = `✅ Se ${verbo} a *todos los socios* de la asociación.`;
        } else if (evento.alcance.startsWith('ETAPA_')) {
            const num = evento.alcance.split('_')[1];
            alcanceTexto = `🏘️ Se ${verbo} a los socios pertenecientes a la *Etapa ${num}*.`;
        } else if (evento.alcance === 'ALFABETICO' && evento.alcance_detalle) {
            alcanceTexto = `🔤 Se ${verbo} a los socios cuyos apellidos empiecen desde la *${evento.alcance_detalle.split('-')[0]}* hasta la *${evento.alcance_detalle.split('-')[1]}* en orden alfabético.`;
        } else if (evento.alcance === 'CON_LOTES') {
            alcanceTexto = `🏡 Se ${verbo} a todos los socios que *poseen lotes* actualmente.`;
        } else if (evento.alcance === 'MANUAL') {
            // Obtener lista de nombres para manual
            const client = getSupabaseClient();
            const { data } = await client
                .from('unoric_asistencias')
                .select('unoric_socios(socio)')
                .eq('evento_id', evento.id);
            
            const nombres = (data || []).map(x => x.unoric_socios?.socio).filter(Boolean).sort();
            if (nombres.length > 0) {
                alcanceTexto = `👥 *Socios convocados:*\n- ` + nombres.join('\n- ');
            } else {
                alcanceTexto = `👥 Se ${verbo} a un *grupo específico* de socios.`;
            }
        }

        msg += `${alcanceTexto}\n\n`;
        msg += `📍 *Lugar:* ${evento.lugar || 'Por definir'}\n`;
        msg += `🚩 *Punto de encuentro:* ${evento.punto_encuentro || 'Por definir'}\n`;
        msg += `⏰ *Hora de inicio:* ${evento.hora_inicio}\n`;
        msg += `📝 *Motivo:* ${evento.descripcion}\n\n`;
        
        if (evento.multa_ausencia > 0) {
            if (isEnCurso) {
                msg += `⚠️ *IMPORTANTE:* No olvide que la inasistencia se sanciona con una multa de *$${evento.multa_ausencia}*.\n\n`;
            } else {
                msg += `⚠️ *NOTA:* La inasistencia injustificada tendrá una multa de *$${evento.multa_ausencia}*.\n\n`;
            }
        } else {
            if (isEnCurso) {
                if (evento.tipo.includes('SESIÓN') || evento.tipo === 'ASAMBLEA') {
                    msg += `🗣️ *SU VOZ CUENTA:* Queremos escuchar sus ideas y participación activa, su presencia es vital para las decisiones de hoy.\n\n`;
                } else if (evento.tipo === 'MINGA') {
                    msg += `🤝 *TRABAJO EN EQUIPO:* Su colaboración es fundamental para el mantenimiento y bienestar de nuestra asociación.\n\n`;
                } else if (evento.tipo === 'EVENTO SOCIAL') {
                    msg += `🎉 *EL EVENTO YA EMPEZÓ:* Su presencia hará que este momento sea mucho más especial. ¡Venga a compartir!\n\n`;
                } else {
                    msg += `✨ *IMPORTANTE:* Recuerde que su asistencia es muy valiosa para la buena marcha de la asociación.\n\n`;
                }
            }
        }

        if (isEnCurso) {
            msg += `¡Le esperamos pronto! Su presencia fortalece nuestra comunidad. 🙌✨`;
        } else {
            msg += `Favor asistir puntualmente. ¡Su participación es importante para la gestión de nuestra asociación! 🙌✨`;
        }

        // Abrir WhatsApp con el mensaje codificado
        const encoded = encodeURIComponent(msg);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }

    async function saveEvento() {
        const alcance = document.getElementById('evo-alcance').value;
        let manualSocios = [];
        
        if (alcance === 'MANUAL') {
            const checked = manualList.querySelectorAll('input[name="manual-socio"]:checked');
            manualSocios = Array.from(checked).map(c => c.value);
            
            if (manualSocios.length === 0) {
                setInlineMessage(msgEl, 'Debes seleccionar al menos un socio para el alcance manual.', 'error');
                return;
            }
        }

        let alcanceDetalle = '';
        if (alcance === 'ALFABETICO') {
            const desde = document.getElementById('evo-alfa-inicio').value;
            const hasta = document.getElementById('evo-alfa-fin').value;
            alcanceDetalle = `${desde}-${hasta}`;
        } else if (alcance.startsWith('ETAPA_')) {
            alcanceDetalle = alcance.replace('ETAPA_', 'Etapa ');
        }

        const payload = {
            tipo: document.getElementById('evo-tipo').value,
            descripcion: document.getElementById('evo-descripcion').value,
            fecha: document.getElementById('evo-fecha').value,
            hora_inicio: document.getElementById('evo-hora-inicio').value,
            hora_toma_lista: document.getElementById('evo-hora-lista').value,
            multa_ausencia: parseFloat(document.getElementById('evo-multa').value),
            lugar: document.getElementById('evo-lugar').value,
            punto_encuentro: document.getElementById('evo-punto-encuentro').value,
            alcance: alcance,
            alcance_detalle: alcanceDetalle,
            created_by: currentUser?.id
        };

        if (payload.multa_ausencia < 0) {
            setInlineMessage(msgEl, 'La multa no puede ser negativa.', 'error');
            return;
        }

        await withLoader('Creando convocatoria...', async () => {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client.from('unoric_eventos').insert([payload]).select();
                if (error) throw error;
                
                const newEvento = data[0];

                // Si es manual, generar asistencias de una vez para no "perder" la selección
                if (alcance === 'MANUAL') {
                    await generarAsistenciasIniciales(newEvento, manualSocios);
                }

                modalEvo.classList.add('hidden');
                await loadEventos();
                updateLiveEventButtons();
                showAlert('Éxito', 'Convocatoria creada correctamente.');
            } catch (err) {
                setInlineMessage(msgEl, err.message, 'error');
            }
        });
    }

    async function cancelarEvento(eventoId) {
        await withLoader('Cancelando convocatoria...', async () => {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('unoric_eventos')
                    .update({ estado: 'CANCELADO' })
                    .eq('id', eventoId);

                if (error) throw error;
                
                await loadEventos();
                updateLiveEventButtons();
                showAlert('Éxito', 'La convocatoria ha sido cancelada.');
            } catch (err) {
                showAlert('Error', 'No se pudo cancelar el evento: ' + err.message, 'error');
            }
        });
    }

    async function abrirControlAsistencia(evento) {
        evoState.selectedEvento = evento;
        document.getElementById('asistencia-evento-nombre').textContent = `${evento.tipo}: ${evento.descripcion}`;
        
        const cardEventos = document.querySelector('.card.mb-6');
        const headerActions = btnNueva?.parentElement?.parentElement;
        
        if (cardEventos) cardEventos.classList.add('hidden');
        if (headerActions) headerActions.classList.add('hidden');
        seccionAsistencia?.classList.remove('hidden');

        // Toggle buttons based on state
        if (evento.estado === 'FINALIZADO') {
            btnFinalizar?.classList.add('hidden');
            btnDescargar?.classList.remove('hidden');
        } else {
            btnFinalizar?.classList.remove('hidden');
            btnDescargar?.classList.add('hidden');
        }

        await withLoader('Cargando lista de socios...', async () => {
            try {
                await loadAsistencias(evento);
            } catch (err) {
                showAlert('Error', 'No se pudieron cargar las asistencias.');
                btnVolverEvos.click();
            }
        });
    }

    async function loadAsistencias(evento) {
        const client = getSupabaseClient();
        
        const { data: exist, error: errE } = await client
            .from('unoric_asistencias')
            .select('*')
            .eq('evento_id', evento.id);
        
        if (errE) throw errE;

        // Si no hay asistencias y NO es manual (las manuales se crean al guardar), generamos ahora
        if (evento.estado === 'PENDIENTE' && exist.length === 0 && evento.alcance !== 'MANUAL') {
            await generarAsistenciasIniciales(evento);
            const { data: nuevo, error: errN } = await client
                .from('unoric_asistencias')
                .select('*')
                .eq('evento_id', evento.id);
            if (errN) throw errN;
            evoState.asistencias = nuevo;
            
            await client.from('unoric_eventos').update({ estado: 'EN_CURSO' }).eq('id', evento.id);
            evento.estado = 'EN_CURSO';
            await loadEventos();
        } else {
            evoState.asistencias = exist;
            // Si estaba pendiente pero ya tiene asistencias (ej manual), lo pasamos a EN_CURSO al abrirlo
            if (evento.estado === 'PENDIENTE') {
                 await client.from('unoric_eventos').update({ estado: 'EN_CURSO' }).eq('id', evento.id);
                 evento.estado = 'EN_CURSO';
            }
        }

        renderAsistencias();
        updateAsistenciaStats();
    }

    async function generarAsistenciasIniciales(evento, sociosForManual = []) {
        const list = getSociosQuickList();
        let filtrados = [];

        if (evento.alcance === 'MANUAL') {
            filtrados = list.filter(s => sociosForManual.includes(s.cedula));
        } else if (evento.alcance.startsWith('ETAPA_')) {
            const etapaNum = parseInt(evento.alcance.split('_')[1]);
            filtrados = list.filter(s => {
                const socioLotes = allLotes.filter(l => l.socio === s.cedula);
                return socioLotes.some(l => l.etapa === etapaNum);
            });
        } else if (evento.alcance === 'CON_LOTES') {
            filtrados = list.filter(s => {
                return allLotes.some(l => l.socio === s.cedula);
            });
        } else if (evento.alcance === 'ALFABETICO') {
            const start = (document.getElementById('evo-alfa-inicio')?.value || 'A').toUpperCase();
            const end = (document.getElementById('evo-alfa-fin')?.value || 'Z').toUpperCase();
            
            filtrados = list.filter(s => {
                const init = normalizeText(s.socio).charAt(0).toUpperCase();
                return init >= start && init <= end;
            });
        } else {
            // DEFAULT: GENERAL
            filtrados = list;
        }

        if (filtrados.length === 0) return;

        const payload = filtrados.map(s => ({
            evento_id: evento.id,
            cedula_socio: s.cedula,
            estado: 'AUSENTE',
            multa_aplicada: evento.multa_ausencia
        }));

        const client = getSupabaseClient();
        for (let i = 0; i < payload.length; i += 100) {
            const { error } = await client.from('unoric_asistencias').insert(payload.slice(i, i + 100));
            if (error) console.error('Error insertando asistencia chunk:', error);
        }
    }

    function renderAsistencias(filtro = '') {
        const body = document.getElementById('asistencia-body');
        const list = getSociosQuickList();
        
        let filtered = evoState.asistencias.map(as => {
            const socio = list.find(s => s.cedula === as.cedula_socio);
            return { ...as, socioName: socio?.socio || 'N/A' };
        });

        if (filtro) {
            const f = normalizeText(filtro);
            filtered = filtered.filter(x => 
                normalizeText(x.socioName).includes(f) || 
                x.cedula_socio.includes(f)
            );
        }

        if (filtered.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="text-center p-4">No hay socios que coincidan con la búsqueda.</td></tr>';
            return;
        }

        const rowDisabled = evoState.selectedEvento.estado === 'FINALIZADO';
        body.innerHTML = filtered.map(as => {
            const colorClass = as.estado === 'PUNTUAL' ? 'success' : (as.estado === 'ATRASADO' ? 'warning' : (as.estado === 'JUSTIFICADO' ? 'info' : 'danger'));
            return `
                <tr>
                    <td><div class="font-bold uppercase" style="font-size: 0.9rem;">${as.socioName}</div></td>
                    <td>
                        <div class="text-sm text-muted">${as.cedula_socio}</div>
                    </td>
                    <td><div class="text-xs">${as.hora_llegada ? new Date(as.hora_llegada).toLocaleTimeString() : '—'}</div></td>
                    <td><span class="badge badge-${colorClass}" style="min-width: 80px; text-align: center;">${as.estado}</span></td>
                    <td>
                        <div class="btn-group" style="display: flex; gap: 4px;">
                            <button class="btn btn-success btn-sm btn-mark" data-cedula="${as.cedula_socio}" data-status="PUNTUAL" ${rowDisabled ? 'disabled' : ''} title="Presente">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-warning btn-sm btn-mark" data-cedula="${as.cedula_socio}" data-status="ATRASADO" ${rowDisabled ? 'disabled' : ''} title="Atrasado">
                                <i class="fas fa-clock"></i>
                            </button>
                            <button class="btn btn-info btn-sm btn-mark" data-cedula="${as.cedula_socio}" data-status="JUSTIFICADO" ${rowDisabled ? 'disabled' : ''} title="Justificar">
                                <i class="fas fa-notes-medical"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        body.querySelectorAll('.btn-mark').forEach(btn => {
            btn.addEventListener('click', async () => {
                const cedula = btn.getAttribute('data-cedula');
                const status = btn.getAttribute('data-status');
                await registrarAsistencia(cedula, status);
            });
        });
    }

    async function registrarAsistencia(cedula, status) {
        const as = evoState.asistencias.find(x => x.cedula_socio === cedula);
        if (!as) return;

        as.estado = status;
        as.hora_llegada = status === 'AUSENTE' ? null : new Date().toISOString();

        try {
            const client = getSupabaseClient();
            const { error } = await client.from('unoric_asistencias').update({
                estado: as.estado,
                hora_llegada: as.hora_llegada
            }).eq('id', as.id);
            
            if (error) throw error;
            
            renderAsistencias(searchAsis.value);
            updateAsistenciaStats();
        } catch (e) {
            console.error(e);
            showAlert('Error', 'No se pudo registrar la asistencia.');
        }
    }

    function updateAsistenciaStats() {
        const p = evoState.asistencias.filter(x => x.estado === 'PUNTUAL').length;
        const a = evoState.asistencias.filter(x => x.estado === 'ATRASADO').length;
        const u = evoState.asistencias.filter(x => x.estado === 'AUSENTE').length;

        document.getElementById('stat-presentes').textContent = p;
        document.getElementById('stat-atrasados').textContent = a;
        document.getElementById('stat-ausentes').textContent = u;
        document.getElementById('stat-total-convocados').textContent = evoState.asistencias.length;
    }

    async function procesarMultasEventos(evento, ausentes) {
        if (ausentes.length === 0) return;

        const tipos = await fetchTiposPago();
        let tipoMulta = tipos.find(t => t.codigo === 'MULTA_AUSENCIA');
        if (!tipoMulta) {
             tipoMulta = tipos.find(t => t.descripcion.toUpperCase().includes('MULTA')) || tipos[0];
        }

        const cargoPayload = ausentes.map(au => ({
            cedula_socio: au.cedula_socio,
            tipo_pago_id: tipoMulta.id,
            descripcion: `${evento.tipo}: ${evento.descripcion}`,
            monto_esperado: evento.multa_ausencia,
            fecha_solicitud: evento.fecha,
            estado: 'PENDIENTE',
            created_by: currentUser?.id
        }));

        const client = getSupabaseClient();
        for (let i = 0; i < cargoPayload.length; i += 100) {
            const { error } = await client.from('unoric_pagos').insert(cargoPayload.slice(i, i + 100));
            if (error) throw error;
        }
    }
}

