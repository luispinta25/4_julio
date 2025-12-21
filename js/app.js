document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// State
let currentUser = null;
let userProfile = null;

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

// View cache
const viewCache = new Map(); // viewName -> { containerEl: HTMLElement, initialized: boolean }
let currentViewName = null;

// Loader state (re-entrant)
let loaderCount = 0;

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

    // Close sidebar when clicking outside (tanto en mobile como desktop)
    document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) &&
            !mobileMenuToggle.contains(e.target) &&
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

// View Loader
async function loadView(viewName) {
    try {
        // If already on same view, don't reload.
        if (currentViewName === viewName) return;

        // If cached, swap instantly.
        const cached = viewCache.get(viewName);
        if (cached && cached.initialized) {
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
        } else if (viewName === 'cobros') {
            await initCobrosModule();
        } else if (viewName === 'mensualidad') {
            await initMensualidadModule();
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
        const { data: socios } = await client
            .from('unoric_socios')
            .select('cedula, socio, estado, celular, correo')
            .order('socio', { ascending: true });

        if (socios && socios.length) {
            writeSociosQuickCache(socios);
        }

        // Precargar lotes
        const { data: lotes } = await client
            .from('unoric_lotes')
            .select('*');

        if (lotes && lotes.length) {
            writeLotesCache(lotes);
        }

        console.log('Precarga completada: socios y lotes cacheados.');
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
        etapa3: document.getElementById('dash-etapa3')
    };

    if (els.totalSocios) els.totalSocios.textContent = stats.totalSocios ?? '--';
    if (els.sociosActivos) els.sociosActivos.textContent = `${stats.sociosActivos ?? '--'} activos`;
    if (els.sociosRetirados) els.sociosRetirados.textContent = `${stats.sociosRetirados ?? '--'} retirados`;
    if (els.totalLotes) els.totalLotes.textContent = stats.totalLotes ?? '--';
    if (els.lotesPromesa) els.lotesPromesa.textContent = `${stats.lotesPromesa ?? '--'} con promesa`;
    if (els.etapa1) els.etapa1.textContent = stats.etapa1 ?? '--';
    if (els.etapa2) els.etapa2.textContent = stats.etapa2 ?? '--';
    if (els.etapa3) els.etapa3.textContent = stats.etapa3 ?? '--';
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
        etapa3
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
        const requiresAdmin = v === 'regularizacion' || v === 'tipos_pago';
        return userHasModule(v) && (!requiresAdmin || isAdmin());
    }

    // Hide cards the user can't access
    grid.querySelectorAll('[data-dash-item]').forEach(card => {
        const v = card.getAttribute('data-dash-item');
        card.style.display = allowedFor(v) ? '' : 'none';
    });

    // Bind navigation buttons
    grid.querySelectorAll('button[data-nav-to]').forEach(btn => {
        btn.addEventListener('click', () => {
            const to = btn.getAttribute('data-nav-to');
            if (!allowedFor(to)) {
                setInlineMessage(msgEl, 'No tienes acceso a este módulo.', 'error');
                return;
            }
            setInlineMessage(msgEl, '', '');
            setActiveNav(to);
            loadView(to);
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

const DASH_PDF_LOGO_URL = 'https://i.ibb.co/1tgLKr62/Gemini-Generated-Image-yqe70kyqe70kyqe7.webp';

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
        const { data, error } = await client
            .from('vw_pagos_por_socio')
            .select('cedula_socio, monto_esperado, monto_abonado, estado_calculado, estado')
            .in('cedula_socio', unique);
        if (error) throw error;
        return data || [];
    }

    async function queryBase() {
        const { data, error } = await client
            .from('unoric_pagos')
            .select('cedula_socio, monto_esperado, estado')
            .in('cedula_socio', unique);
        if (error) throw error;
        // Base table doesn't have monto_abonado; treat unpaid as full monto_esperado
        return (data || []).map(r => ({
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
    } catch (_) {
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
    const title = String(titleEl?.value || '').trim() || 'UNORIC - Reporte de Socios';
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
            const genDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

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
                estado: s.estado
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
        return allSocios.map(s => ({ cedula: s.cedula, socio: s.socio, estado: s.estado }));
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
    const socioInfo = document.getElementById('cobros-socio-info');
    const obligacionesBody = document.getElementById('cobros-obligaciones-body');
    const searchObligaciones = document.getElementById('cobros-search-obligaciones');

    const seleccionInfo = document.getElementById('cobros-seleccion');
    const pagoForm = document.getElementById('cobros-form-pago');
    const pagoFecha = document.getElementById('cobros-pago-fecha');
    const pagoMonto = document.getElementById('cobros-pago-monto');
    const pagoReferencia = document.getElementById('cobros-pago-referencia');
    const pagoObservaciones = document.getElementById('cobros-pago-observaciones');
    const pagoSubmit = document.getElementById('cobros-registrar');
    const pagoMsg = document.getElementById('cobros-pago-msg');

    const obligForm = document.getElementById('cobros-form-obligacion');
    const tipoSelect = document.getElementById('cobros-tipo');
    const loteSelect = document.getElementById('cobros-lote');
    const descInput = document.getElementById('cobros-descripcion');
    const montoEsperado = document.getElementById('cobros-monto-esperado');
    const periodoDesde = document.getElementById('cobros-periodo-desde');
    const periodoHasta = document.getElementById('cobros-periodo-hasta');
    const obligSubmit = document.getElementById('cobros-crear-obligacion');
    const obligMsg = document.getElementById('cobros-obligacion-msg');

    pagoFecha.value = todayISODate();

    function resetSelection() {
        cobrosState.selectedPago = null;
        seleccionInfo.textContent = 'Selecciona una obligación en la tabla.';
        [pagoMonto, pagoReferencia, pagoObservaciones, pagoSubmit].forEach(el => el.disabled = true);
        setInlineMessage(pagoMsg, '', '');
    }

    function setCreateEnabled(enabled) {
        [tipoSelect, loteSelect, descInput, montoEsperado, periodoDesde, periodoHasta, obligSubmit].forEach(el => {
            el.disabled = !enabled;
        });
        setInlineMessage(obligMsg, '', '');
    }

    function applySocioActivoGates() {
        if (cobrosState.socio && !cobrosState.socioActivo) {
            resetSelection();
            setCreateEnabled(false);
            setInlineMessage(obligMsg, 'Socio retirado: no se pueden crear obligaciones.', 'error');
            setInlineMessage(pagoMsg, 'Socio retirado: no se pueden registrar pagos/cobros.', 'error');
        }
    }

    function setObligacionesFilterEnabled(enabled) {
        searchObligaciones.disabled = !enabled;
        if (!enabled) searchObligaciones.value = '';
    }

    function renderObligaciones(list) {
        if (!list || list.length === 0) {
            obligacionesBody.innerHTML = `<tr><td colspan="6" class="text-center p-4">No hay obligaciones para este socio</td></tr>`;
            return;
        }

        const display = list.slice(0, 200);
        obligacionesBody.innerHTML = display.map(p => {
            const tipo = p.tipo_codigo || p.tipo_descripcion || String(p.tipo_pago_id || '');
            const estado = normalizePagoEstado(p.estado_calculado || p.estado) || 'PENDIENTE';
            let badge = '<span class="badge badge-info">PENDIENTE</span>';
            if (estado === 'PAGADO') badge = '<span class="badge badge-success">PAGADO</span>';
            else if (estado === 'PARCIAL') badge = '<span class="badge badge-warning">PARCIAL</span>';

            const abonado = p.monto_abonado != null ? p.monto_abonado : '';

            return `
                <tr>
                    <td>${tipo}</td>
                    <td style="max-width: 280px; white-space: normal;">${p.descripcion || ''}</td>
                    <td>$${formatMoney(p.monto_esperado)}</td>
                    <td>${abonado === '' ? '-' : `$${formatMoney(abonado)}`}</td>
                    <td>${badge}</td>
                    <td>
                        <button class="btn btn-primary btn-sm" data-pago-id="${p.id}">
                            <i class="fas fa-hand-holding-usd"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Row actions
        obligacionesBody.querySelectorAll('button[data-pago-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (cobrosState.socio && !cobrosState.socioActivo) {
                    applySocioActivoGates();
                    seleccionInfo.textContent = 'Socio retirado: no se pueden seleccionar obligaciones para pagar.';
                    return;
                }
                const id = btn.getAttribute('data-pago-id');
                const pago = cobrosState.pagos.find(x => x.id === id);
                if (!pago) return;
                cobrosState.selectedPago = pago;
                const tipo = pago.tipo_codigo || pago.tipo_descripcion || String(pago.tipo_pago_id || '');
                seleccionInfo.textContent = `Obligación seleccionada: ${tipo} - ${pago.descripcion || ''}`;
                [pagoMonto, pagoReferencia, pagoObservaciones, pagoSubmit].forEach(el => el.disabled = false);
                setInlineMessage(pagoMsg, '', '');
            });
        });
    }

    async function loadSocioAndData() {
        const cedula = (cedulaInput.value || '').trim();
        setInlineMessage(pagoMsg, '', '');
        setInlineMessage(obligMsg, '', '');
        resetSelection();
        setCreateEnabled(false);
        setObligacionesFilterEnabled(false);

        if (!cedula) {
            socioInfo.style.display = 'none';
            obligacionesBody.innerHTML = `<tr><td colspan="6" class="text-center p-4">Busca un socio para ver obligaciones</td></tr>`;
            return;
        }

        await withLoader('Consultando pagos...', async () => {
            try {
                const socio = await safeSelectSingle('unoric_socios', 'cedula, socio, estado', 'cedula', cedula);
                if (!socio) {
                    socioInfo.style.display = 'block';
                    socioInfo.textContent = 'Socio no encontrado.';
                    obligacionesBody.innerHTML = `<tr><td colspan="6" class="text-center p-4">Socio no encontrado</td></tr>`;
                    return;
                }
                cobrosState.socio = socio;
                cobrosState.socioActivo = isSocioActivoValue(socio.estado);
                socioInfo.style.display = 'block';
                socioInfo.textContent = `${socio.socio || ''} (Cédula: ${socio.cedula})${cobrosState.socioActivo ? '' : ' - RETIRADO'}`;

                cobrosState.lotes = await fetchLotesBySocio(cedula);
                cobrosState.tipos = await fetchTiposPago();
                cobrosState.pagos = await fetchPagosPorSocio(cedula);

                // Populate selects
                tipoSelect.innerHTML = '<option value="">Selecciona...</option>' + cobrosState.tipos.map(t => {
                    const flags = [t.es_regularizacion ? 'REG' : null, t.afecta_obligaciones ? 'OBL' : null].filter(Boolean).join(', ');
                    const extra = flags ? ` (${flags})` : '';
                    return `<option value="${t.id}">${t.codigo} - ${t.descripcion}${extra}</option>`;
                }).join('');

                loteSelect.innerHTML = '<option value="">Sin lote</option>' + cobrosState.lotes.map(l => {
                    return `<option value="${l.id_lote}">Lote ${l.lote} (Etapa ${l.etapa})</option>`;
                }).join('');

                renderObligaciones(cobrosState.pagos);
                setObligacionesFilterEnabled(true);

                // Enable create obligation for both roles, but operators cannot set past periods
                setCreateEnabled(true);
                if (!isAdmin()) {
                    // Operators: prevent setting past dates (visual)
                    periodoDesde.setAttribute('min', todayISODate());
                    periodoHasta.setAttribute('min', todayISODate());
                } else {
                    periodoDesde.removeAttribute('min');
                    periodoHasta.removeAttribute('min');
                }

                applySocioActivoGates();
            } catch (e) {
                console.error(e);
                socioInfo.style.display = 'block';
                socioInfo.textContent = `Error: ${e.message}`;
            }
        });
    }

    buscarBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loadSocioAndData();
    });
    cedulaInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadSocioAndData();
        }
    });

    searchObligaciones.addEventListener('input', () => {
        const term = (searchObligaciones.value || '').toLowerCase();
        const filtered = (cobrosState.pagos || []).filter(p => {
            const tipo = (p.tipo_codigo || p.tipo_descripcion || '').toLowerCase();
            const desc = (p.descripcion || '').toLowerCase();
            return tipo.includes(term) || desc.includes(term);
        });
        renderObligaciones(filtered);
        resetSelection();
    });

    pagoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setInlineMessage(pagoMsg, '', '');
        if (cobrosState.socio && !cobrosState.socioActivo) {
            applySocioActivoGates();
            return;
        }
        if (!cobrosState.selectedPago) {
            setInlineMessage(pagoMsg, 'Selecciona una obligación primero.', 'error');
            return;
        }

        const monto = Number(pagoMonto.value);
        if (!monto || monto <= 0) {
            setInlineMessage(pagoMsg, 'Monto inválido.', 'error');
            return;
        }

        await withLoader('Registrando pago...', async () => {
            try {
                const client = getSupabaseClient();
                const payload = {
                    pago_id: cobrosState.selectedPago.id,
                    fecha_pago: pagoFecha.value || todayISODate(),
                    monto,
                    referencia: (pagoReferencia.value || '').trim() || null,
                    observaciones: (pagoObservaciones.value || '').trim() || null,
                    created_by: currentUser?.id
                };
                const { error } = await client.from('unoric_pagos_registros').insert([payload]);
                if (error) throw error;

                setInlineMessage(pagoMsg, 'Pago registrado correctamente.', 'success');
                pagoMonto.value = '';
                pagoReferencia.value = '';
                pagoObservaciones.value = '';

                // refresh obligations
                cobrosState.pagos = await fetchPagosPorSocio(cobrosState.socio.cedula);
                renderObligaciones(cobrosState.pagos);
            } catch (err) {
                console.error(err);
                setInlineMessage(pagoMsg, `Error registrando pago: ${err.message}`, 'error');
            }
        });
    });

    obligForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setInlineMessage(obligMsg, '', '');

        if (!cobrosState.socio) {
            setInlineMessage(obligMsg, 'Busca un socio primero.', 'error');
            return;
        }

        if (!cobrosState.socioActivo) {
            applySocioActivoGates();
            return;
        }

        const tipoId = Number(tipoSelect.value);
        const monto = Number(montoEsperado.value);
        const descripcion = (descInput.value || '').trim();

        if (!tipoId) {
            setInlineMessage(obligMsg, 'Selecciona un tipo de pago.', 'error');
            return;
        }
        if (!descripcion) {
            setInlineMessage(obligMsg, 'Descripción requerida.', 'error');
            return;
        }
        if (!monto || monto <= 0) {
            setInlineMessage(obligMsg, 'Monto esperado inválido.', 'error');
            return;
        }

        if (!isAdmin()) {
            if (isPastDate(periodoDesde.value) || isPastDate(periodoHasta.value)) {
                setInlineMessage(obligMsg, 'Operador: no se permiten obligaciones con periodos en el pasado.', 'error');
                return;
            }
        }

        await withLoader('Creando obligación...', async () => {
            try {
                const client = getSupabaseClient();
                const payload = {
                    cedula_socio: cobrosState.socio.cedula,
                    id_lote: loteSelect.value || null,
                    tipo_pago_id: tipoId,
                    descripcion,
                    monto_esperado: monto,
                    periodo_desde: periodoDesde.value || null,
                    periodo_hasta: periodoHasta.value || null,
                    estado: 'PENDIENTE',
                    created_by: currentUser?.id
                };
                const { data, error } = await client.from('unoric_pagos').insert([payload]).select('id').single();
                if (error) throw error;

                setInlineMessage(obligMsg, 'Obligación creada correctamente.', 'success');
                // refresh
                cobrosState.pagos = await fetchPagosPorSocio(cobrosState.socio.cedula);
                renderObligaciones(cobrosState.pagos);

                // auto-select newly created obligation if returned
                if (data?.id) {
                    const created = cobrosState.pagos.find(x => x.id === data.id);
                    if (created) {
                        cobrosState.selectedPago = created;
                        const tipo = created.tipo_codigo || created.tipo_descripcion || String(created.tipo_pago_id || '');
                        seleccionInfo.textContent = `Obligación seleccionada: ${tipo} - ${created.descripcion || ''}`;
                        [pagoMonto, pagoReferencia, pagoObservaciones, pagoSubmit].forEach(el => el.disabled = false);
                    }
                }
            } catch (err) {
                console.error(err);
                setInlineMessage(obligMsg, `Error creando obligación: ${err.message}`, 'error');
            }
        });
    });
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
// SOCIOS MODULE LOGIC
// ==========================================
let allSocios = [];
let filteredSocios = [];

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

    function computeMonthlyFeePerLote() {
        // Regla fija solicitada: 5 USD por lote por mes
        return DEFAULT_MENSUALIDAD_USD_POR_LOTE;
    }

    function computeMonthlyFeePerLoteForYear(year) {
        const y = Number(year);
        const fromTarifa = mensState?.tarifasPorAnio?.get?.(y);
        if (fromTarifa != null && Number(fromTarifa) > 0) return Number(fromTarifa);

        const fromBase = mensState?.mensualidadTipoMontoBase;
        if (fromBase != null && Number(fromBase) > 0) return Number(fromBase);

        return computeMonthlyFeePerLote();
    }

    function computeAmountForYearItem(item, hastaMes, loteCount) {
        const lc = Number(loteCount || 0);
        const fee = computeMonthlyFeePerLoteForYear(item?.year);
        const fromMonth = Number(item?.paidThroughMonth || 0);
        const toMonth = Number(hastaMes || 0);
        const monthsToPay = Math.max(0, toMonth - fromMonth);
        return monthsToPay * fee * lc;
    }

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
        const top = matches.slice(0, 8);
        localResults.innerHTML = `
            <div class="mt-2">
                <div class="text-muted text-sm mb-1">Coincidencias (clic para seleccionar):</div>
                <div class="grid" style="grid-template-columns: 1fr; gap: 6px;">
                    ${top.map(s => {
            const activo = isSocioActivoValue(s.estado);
            const badge = activo ? '' : '<span class="badge badge-danger" style="margin-left:8px;">Retirado</span>';
            return `
                            <button type="button" class="btn btn-secondary" style="justify-content: space-between; display:flex; align-items:center;" data-cedula="${s.cedula}">
                                <span>${s.socio || ''} <span class="text-muted">(${s.cedula})</span></span>
                                ${badge}
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

    function buildMensualidadItems(pagosBase, loteCount) {
        // pagosBase: rows from unoric_pagos (tipo MENSUALIDAD). Interpretación:
        // Un registro por AÑO: periodo_desde=YYYY-01-01, periodo_hasta=YYYY-MM-DD (hasta qué mes pagó).
        const now = new Date();
        const currentYear = now.getFullYear();

        let minYear = currentYear;
        let defaultMonto = null;

        // Pick the best record per year (max periodo_hasta). If duplicates exist, we take the furthest coverage.
        const bestByYear = new Map(); // year -> { id, estado, hastaMonth, hastaDateISO, monto }

        (pagosBase || []).forEach(p => {
            if (p.monto_esperado != null && Number(p.monto_esperado) > 0) defaultMonto = defaultMonto ?? Number(p.monto_esperado);

            const from = parseISODateParts(p.periodo_desde);
            const to = parseISODateParts(p.periodo_hasta);
            const y = from?.year || to?.year;
            if (!y) return;
            if (y < minYear) minYear = y;

            const hastaISO = String(p.periodo_hasta || '');
            const hastaMonth = to?.month || 0;
            const estado = normalizePagoEstado(p.estado) || 'PENDIENTE';
            const prev = bestByYear.get(y);

            if (!prev) {
                bestByYear.set(y, {
                    id: p.id,
                    estado,
                    hastaMonth,
                    hastaISO,
                    monto: p.monto_esperado
                });
                return;
            }

            // Compare by periodo_hasta; fall back to month
            const prevISO = String(prev.hastaISO || '');
            if (hastaISO && (!prevISO || hastaISO > prevISO)) {
                bestByYear.set(y, {
                    id: p.id,
                    estado,
                    hastaMonth,
                    hastaISO,
                    monto: p.monto_esperado
                });
            } else if (hastaMonth > (prev.hastaMonth || 0)) {
                bestByYear.set(y, {
                    id: p.id,
                    estado,
                    hastaMonth,
                    hastaISO,
                    monto: p.monto_esperado
                });
            }
        });

        const items = [];
        const lc = Number(loteCount || 0);

        for (let y = minYear; y <= currentYear; y += 1) {
            const best = bestByYear.get(y);
            const paidThroughMonth = best?.hastaMonth || 0;
            const fullYearPaid = best && best.estado === 'PAGADO' && paidThroughMonth >= 12;

            const monthlyFeePerLote = computeMonthlyFeePerLoteForYear(y);

            const pendingMonths = fullYearPaid ? 0 : Math.max(0, 12 - paidThroughMonth);
            const pendienteMonto = pendingMonths * monthlyFeePerLote * lc;
            const pendienteDisplay = null;

            if (fullYearPaid) {
                items.push({
                    kind: 'pagado',
                    key: `paid-${y}`,
                    year: y,
                    paidThroughMonth,
                    pagoId: best.id,
                    detail: 'Pagado (año completo)',
                    estado: 'PAGADO',
                    pendienteMonto: 0,
                    pendienteDisplay: null,
                    feePerLote: monthlyFeePerLote
                });
            } else {
                const detail = best
                    ? (paidThroughMonth > 0 ? `Pagado hasta ${monthNameES(paidThroughMonth)}` : 'Pendiente')
                    : 'Sin pago registrado';

                items.push({
                    kind: 'pendiente',
                    key: `pend-${y}`,
                    year: y,
                    paidThroughMonth,
                    pagoId: best?.id || null,
                    detail,
                    estado: 'PENDIENTE',
                    pendienteMonto,
                    pendienteDisplay,
                    pendingMonths,
                    feePerLote: monthlyFeePerLote
                });
            }
        }

        // Pendientes primero, luego pagados
        items.sort((a, b) => {
            const ga = a.kind === 'pendiente' ? 0 : 1;
            const gb = b.kind === 'pendiente' ? 0 : 1;
            if (ga !== gb) return ga - gb;
            if (a.year !== b.year) return a.year - b.year;
            return 0;
        });

        return { items, defaultMonto };
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
        const badge = mensState.socioActivo ? '' : ' <span class="badge badge-danger">RETIRADO</span>';
        socioInfo.style.display = 'block';
        socioInfo.innerHTML = `${socio.socio || ''} (Cédula: ${socio.cedula})${badge}`;

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

                const lotes = await fetchLotesBySocio(mensState.socio.cedula);
                mensState.loteCount = (lotes || []).length;

                // Update header with lote count
                const loteBadge = ` <span class="badge badge-info">Lotes: ${mensState.loteCount}</span>`;
                socioInfo.innerHTML = `${mensState.socio.socio || ''} (Cédula: ${mensState.socio.cedula})${badge}${loteBadge}`;

                const built = buildMensualidadItems(mensState.pagos, mensState.loteCount);
                mensState.items = built.items;
                mensState.defaultMonto = built.defaultMonto;
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
                const built = buildMensualidadItems(mensState.pagos, mensState.loteCount);
                mensState.items = built.items;
                mensState.defaultMonto = built.defaultMonto;
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
let allLotes = [];
let filteredLotes = [];

async function initLotesModule() {
    const tableBody = document.getElementById('lotes-table-body');
    const totalLotesEl = document.getElementById('total-lotes');
    const lotesPromesaEl = document.getElementById('lotes-promesa');
    const lotesIncompleteEl = document.getElementById('lotes-incomplete');
    const searchInput = document.getElementById('search-lotes');
    const filterEtapa = document.getElementById('filter-lote-etapa');
    const filterEstado = document.getElementById('filter-lote-estado');

    beginLoading('Cargando lotes...');
    try {
        const client = getSupabaseClient();

        // Fetch Lotes
        const { data: lotes, error: lotesError } = await client
            .from('unoric_lotes')
            .select('*')
            .order('lote', { ascending: true }); // Sort by lote ascending

        if (lotesError) throw lotesError;

        // Fetch Socios (to get names)
        const { data: socios, error: sociosError } = await client
            .from('unoric_socios')
            .select('cedula, socio');

        if (sociosError) throw sociosError;

        // Create a map for quick socio lookup
        const sociosMap = new Map(socios.map(s => [s.cedula, s.socio]));

        // Process Data
        allLotes = lotes.map(lote => {
            const socioName = sociosMap.get(lote.socio) || 'Desconocido';

            // Check for invalid contact info (using lote's contact info if available, or fallback logic if needed)
            // Assuming the lote table has the contact info snapshot or we should check the socio's current info?
            // The requirement says "actualizar datos de celular o de correo", implying we check the data in the row.
            // The CSV import put contact info in the lotes table too.

            const invalidPhone = lote.celular === '999999999';
            const invalidEmail = !lote.correo || lote.correo.includes('sin@correo') || lote.correo.includes('actualizar@correo');
            const needsUpdate = invalidPhone || invalidEmail;

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
        lotesPromesaEl.textContent = allLotes.filter(l => l.promesa === 'SI').length;
        lotesIncompleteEl.textContent = allLotes.filter(l => l.needsUpdate).length;

        // Initial Render
        filteredLotes = [...allLotes];
        renderLotesTable(filteredLotes);

        // Event Listeners
        searchInput.addEventListener('input', (e) => filterLotes(e.target.value, filterEtapa.value, filterEstado.value));
        filterEtapa.addEventListener('change', (e) => filterLotes(searchInput.value, e.target.value, filterEstado.value));
        filterEstado.addEventListener('change', (e) => filterLotes(searchInput.value, filterEtapa.value, e.target.value));

    } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center error-message">Error cargando datos: ${error.message}</td></tr>`;
    } finally {
        endLoading();
    }
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
                    <div class="socio-cedula"><i class="far fa-id-card"></i> ${lote.socio}</div>
                </td>
                <td>
                    <div class="contact-info">
                        <div class="contact-item ${phoneClass}">
                            ${phoneIcon} ${lote.celular}
                        </div>
                        <div class="contact-item ${emailClass}">
                            ${emailIcon} ${lote.correo}
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
                    <button class="btn btn-primary btn-sm" onclick="alert('Editar lote: ${lote.lote}')">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

