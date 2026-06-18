// ─── app.js ───────────────────────────────────────────────────────────────────

// 1. Verificar autenticación
const session = getSession();
if (!session) {
    window.location.replace('index.html');
    throw new Error('Sesión no iniciada');
}

// 2. Estado global
let allClients   = [];
let activeFilter = 'all';
let searchQuery  = '';

// 3. Inicializar header
document.getElementById('branchName').textContent = session.branch.toUpperCase();
document.getElementById('userName').textContent   = session.username;

// ─── Utilidades ───────────────────────────────────────────────────────────────

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
}

function showToast(msg, duration = 2500) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

function getInitials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || '?')[0].toUpperCase();
}

const AVATAR_COLORS = ['#1565C0','#AD1457','#00695C','#E65100','#4527A0','#2E7D32','#0277BD','#6D4C41'];
function avatarColor(name) {
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ─── Registro de contactados (localStorage por día+sucursal) ─────────────────

function todayKey() {
    const today = new Date().toISOString().split('T')[0];
    return `vt_contacted_${today}_${session.branch}`;
}

function getContacted() {
    try { return JSON.parse(localStorage.getItem(todayKey()) || '{}'); }
    catch { return {}; }
}

function saveContacted(map) {
    localStorage.setItem(todayKey(), JSON.stringify(map));
}

function markContacted(clientIdx, type, phone) {
    const map = getContacted();
    const now = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    map[clientIdx] = { type, phone, time: now };
    saveContacted(map);
}

// ─── Notas por cliente ────────────────────────────────────────────────────────

function getNoteKey(client) {
    const id = client.dni ? `dni_${client.dni}` : `idx_${client._idx}`;
    return `vt_note_${session.branch}_${id}`;
}

function getNote(client) {
    return localStorage.getItem(getNoteKey(client)) || '';
}

function onNoteChange(clientIdx, text) {
    const client = allClients[clientIdx];
    if (!client) return;
    const key = getNoteKey(client);
    if (text.trim()) localStorage.setItem(key, text.trim());
    else             localStorage.removeItem(key);
}

// ─── Carga de clientes desde GitHub raw ──────────────────────────────────────

async function loadClients() {
    const branch = encodeURIComponent(session.branch);
    const url    = `${CONFIG.RAW_BASE}/data/clients/${branch}.json?t=${Date.now()}`;
    const resp   = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`No se encontró la lista para "${session.branch}"`);
    const data = await resp.json();
    return data.map((c, i) => ({ ...c, _idx: i }));
}

// ─── Filtrado ─────────────────────────────────────────────────────────────────

function getFiltered() {
    const contacted = getContacted();
    let list = allClients;

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter(c =>
            (c.nombre   || '').toLowerCase().includes(q) ||
            (c.dni      || '').toLowerCase().includes(q) ||
            (c.telefono || '').toLowerCase().includes(q) ||
            (c.tel2     || '').toLowerCase().includes(q) ||
            (c.tel3     || '').toLowerCase().includes(q)
        );
    }

    if (activeFilter === 'contacted') list = list.filter(c => contacted[c._idx] !== undefined);
    if (activeFilter === 'pending')   list = list.filter(c => contacted[c._idx] === undefined);

    return list;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderClients() {
    const list      = getFiltered();
    const contacted = getContacted();
    const total     = allClients.length;
    const doneCount = Object.keys(contacted).length;
    const pct       = total > 0 ? Math.round(doneCount / total * 100) : 0;
    const container = document.getElementById('clientList');

    const statsHtml = `
        <div class="stats-bar">
            <div class="stats-numbers">
                <strong>${doneCount}</strong> / ${total} contactados
                ${searchQuery || activeFilter !== 'all'
                    ? `<span class="stats-filter"> · ${list.length} resultados</span>` : ''}
            </div>
            <div class="stats-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${pct}%"></div>
                </div>
                <span class="progress-pct">${pct}%</span>
            </div>
        </div>`;

    if (list.length === 0) {
        const isAll = activeFilter === 'all';
        container.innerHTML = statsHtml + `
            <div class="empty-state">
                <div class="empty-icon">${searchQuery ? '🔍' : (isAll ? '📋' : '✅')}</div>
                <h3>${searchQuery ? 'Sin resultados' : (activeFilter === 'pending' ? '¡Todo contactado!' : 'Ninguno contactado aún')}</h3>
                <p>${searchQuery ? 'Probá con otro término de búsqueda.' : ''}</p>
            </div>`;
        return;
    }

    const cards = list.map(c => buildCard(c, contacted[c._idx])).join('');
    container.innerHTML = statsHtml + cards;
}

// ─── Tarjeta de cliente ───────────────────────────────────────────────────────

function buildCard(client, contactLog) {
    const isContacted = !!contactLog;
    const idx         = client._idx;
    const initials    = esc(getInitials(client.nombre));
    const color       = avatarColor(client.nombre);
    const name        = esc(client.nombre || 'Sin nombre');

    // Teléfonos disponibles
    const phones = [client.telefono, client.tel2, client.tel3]
        .filter(n => n && String(n).trim() !== '');
    const firstPhone = phones[0] || '';

    // Badge de contactado
    const badgeHtml = isContacted
        ? `<div class="contacted-badge">✓ ${esc(contactLog.type)} · ${esc(contactLog.time)}</div>`
        : '';

    // Meta (DNI + última compra)
    const metaParts = [
        client.dni           && `DNI ${esc(client.dni)}`,
        client.ultima_compra && `Últ: ${esc(client.ultima_compra)}`
    ].filter(Boolean);
    const metaHtml = metaParts.length
        ? `<div class="client-meta">${metaParts.map(t => `<span class="tag">${t}</span>`).join('')}</div>`
        : '';

    // Filas de teléfono (con SVG icons)
    const phonesHtml = phones.length === 0
        ? `<div class="no-phone">Sin teléfono registrado</div>`
        : phones.map((num, i) => `
            <div class="phone-row">
                <div class="phone-info">
                    <span class="phone-label">Tel.${i + 1}</span>
                    <span class="phone-number">${esc(num)}</span>
                </div>
                <div class="contact-btns">
                    <button class="btn-contact btn-call" title="Llamar"
                        onclick="handleContact(${idx},'${esc(num)}','llamada')">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                    </button>
                    <button class="btn-contact btn-sms" title="SMS"
                        onclick="handleContact(${idx},'${esc(num)}','sms')">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
                    </button>
                    <button class="btn-contact btn-wa" title="WhatsApp"
                        onclick="handleContact(${idx},'${esc(num)}','whatsapp')">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </button>
                </div>
            </div>`).join('');

    // Botón enviar promo
    const promoBtnHtml = firstPhone ? `
        <button class="btn-promo" onclick="sendPromo(${idx})">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Enviar Promoción por WhatsApp
        </button>` : '';

    // Nota del vendedor
    const noteHtml = `
        <textarea class="note-input" placeholder="📝 Agregar nota del vendedor..."
            oninput="onNoteChange(${idx}, this.value)">${esc(getNote(client))}</textarea>`;

    return `
        <div class="client-card ${isContacted ? 'contacted' : ''}">
            <div class="card-top">
                <div class="client-avatar" style="background:${color}">${initials}</div>
                <div class="card-main">
                    <div class="client-name">${name}</div>
                    ${metaHtml}
                </div>
                ${badgeHtml}
            </div>
            <div class="phone-list">${phonesHtml}</div>
            ${promoBtnHtml}
            ${noteHtml}
        </div>`;
}

// ─── Enviar Promoción por WhatsApp ────────────────────────────────────────────

function sendPromo(clientIdx) {
    const client = allClients[clientIdx];
    if (!client) return;

    const phone = client.telefono || client.tel2 || client.tel3;
    if (!phone) { showToast('Este cliente no tiene teléfono registrado'); return; }

    const nombre = (client.nombre || '').trim();
    const msg = 'Hola ' + nombre + ' te hablamos de MARATHON DEPORTES ,hace tiempo que no compras con credito personal y tenemos una promocion para ofrecerte!!\n3 Cuotas sin interes en marcas seleccionadas!! \nEntra a este link y descubri mas promociones para vos!! https://catalogo.maromega.com.ar/';
    const digits = phone.replace(/\D/g, '');
    const local  = digits.startsWith('0') ? digits.slice(1) : digits;
    const number = '54' + local;

    markContacted(clientIdx, 'promo-WA', phone);
    renderClients();

    const entry = {
        date:         new Date().toISOString().split('T')[0],
        time:         new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
        username:     session.username,
        branch:       session.branch,
        client_dni:   client.dni    || '',
        client_name:  client.nombre || '',
        contact_type: 'promo-WA',
        phone_used:   phone
    };
    writeLog(entry).catch(err => console.warn('No se pudo guardar el log (promo):', err));

    setTimeout(() => {
        window.open('https://wa.me/' + number + '?text=' + encodeURIComponent(msg), '_blank');
    }, 80);
}

// ─── Acciones de contacto ─────────────────────────────────────────────────────

function handleContact(clientIdx, phone, type) {
    const client = allClients[clientIdx];
    if (!client) return;

    markContacted(clientIdx, type, phone);
    renderClients();

    const entry = {
        date:         new Date().toISOString().split('T')[0],
        time:         new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
        username:     session.username,
        branch:       session.branch,
        client_dni:   client.dni    || '',
        client_name:  client.nombre || '',
        contact_type: type,
        phone_used:   phone
    };
    writeLog(entry).catch(err => console.warn('No se pudo guardar el log:', err));

    const cleanPhone = phone.replace(/\s/g, '');
    setTimeout(() => {
        if (type === 'llamada') {
            window.location.href = `tel:${cleanPhone}`;
        } else if (type === 'sms') {
            window.location.href = `sms:${cleanPhone}`;
        } else if (type === 'whatsapp') {
            const digits = cleanPhone.replace(/\D/g, '');
            const local  = digits.startsWith('0') ? digits.slice(1) : digits;
            const number = '54' + local;
            const nombre = (client.nombre || '').trim();
            const msg = 'Hola ' + nombre + ' te hablamos de MARATHON DEPORTES ,hace tiempo que no compras con credito personal y tenemos una promocion para ofrecerte!!\n3 Cuotas sin interes en marcas seleccionadas!! \nEntra a este link y descubri mas promociones para vos!! https://catalogo.maromega.com.ar/';
            window.open('https://wa.me/' + number + '?text=' + encodeURIComponent(msg), '_blank');
        }
    }, 80);
}

// ─── Log a GitHub API ─────────────────────────────────────────────────────────

async function writeLog(entry) {
    const token = localStorage.getItem('vt_logs_token') || '';
    if (!token) return;

    const path    = `data/logs/${entry.date}.json`;
    const apiUrl  = `${CONFIG.API_BASE}/${path}`;
    const headers = {
        'Authorization': `token ${token}`,
        'Accept':        'application/vnd.github.v3+json',
        'Content-Type':  'application/json'
    };

    let currentLogs = [];
    let fileSha     = null;
    const getResp   = await fetch(apiUrl, { headers });
    if (getResp.ok) {
        const data  = await getResp.json();
        fileSha     = data.sha;
        currentLogs = JSON.parse(atob(data.content.replace(/\n/g, '')));
    }

    currentLogs.push(entry);
    const jsonStr    = JSON.stringify(currentLogs, null, 2);
    const newContent = btoa(unescape(encodeURIComponent(jsonStr)));
    const body       = {
        message: `log: ${entry.username} › ${entry.contact_type} › ${entry.client_name}`,
        content: newContent,
        branch:  CONFIG.GITHUB_BRANCH
    };
    if (fileSha) body.sha = fileSha;

    const putResp = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!putResp.ok) {
        const err = await putResp.text();
        throw new Error(`GitHub API ${putResp.status}: ${err.slice(0, 120)}`);
    }
}

// ─── Controles de filtro y búsqueda ──────────────────────────────────────────

function setFilter(filter, btn) {
    activeFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderClients();
}

function onSearch() {
    searchQuery = document.getElementById('searchInput').value.trim();
    renderClients();
}

// ─── Arranque ─────────────────────────────────────────────────────────────────

(async function init() {
    const container = document.getElementById('clientList');
    try {
        allClients = await loadClients();
        renderClients();
    } catch (e) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">❌</div>
                <h3>Error al cargar</h3>
                <p>${esc(e.message)}</p>
                <button onclick="location.reload()" class="btn-retry">Reintentar</button>
            </div>`;
    }
})();


// ─── Utilidades ───────────────────────────────────────────────────────────────

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
}

function showToast(msg, duration = 2200) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

// ─── Registro de contactados (localStorage por día+sucursal) ─────────────────

function todayKey() {
    const today = new Date().toISOString().split('T')[0];
    return `vt_contacted_${today}_${session.branch}`;
}

function getContacted() {
    const raw = localStorage.getItem(todayKey());
    return raw ? JSON.parse(raw) : {};
}

function saveContacted(map) {
    localStorage.setItem(todayKey(), JSON.stringify(map));
}

function markContacted(clientId, type, phone) {
    const map = getContacted();
    const now = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    map[clientId] = { type, phone, time: now };
    saveContacted(map);
}

// ─── Carga de clientes desde GitHub raw ──────────────────────────────────────

async function loadClients() {
    const branch  = encodeURIComponent(session.branch);
    const url     = `${CONFIG.RAW_BASE}/data/clients/${branch}.json?t=${Date.now()}`;
    const resp    = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`No se encontró la lista de clientes para "${session.branch}"`);
    const data = await resp.json();
    // Asignar índice interno estable
    return data.map((c, i) => ({ ...c, _idx: i }));
}

// ─── Filtrado ─────────────────────────────────────────────────────────────────

function getFiltered() {
    const contacted = getContacted();
    let list = allClients;

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter(c =>
            (c.nombre     || '').toLowerCase().includes(q) ||
            (c.dni        || '').toLowerCase().includes(q) ||
            (c.telefono   || '').toLowerCase().includes(q)
        );
    }

    if (activeFilter === 'contacted') {
        list = list.filter(c => contacted[c._idx] !== undefined);
    } else if (activeFilter === 'pending') {
        list = list.filter(c => contacted[c._idx] === undefined);
    }

    return list;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderClients() {
    const list      = getFiltered();
    const contacted = getContacted();
    const total     = allClients.length;
    const doneCount = Object.keys(contacted).length;
    const container = document.getElementById('clientList');

    const stats = `
        <div class="stats-bar">
            📊 <strong>${doneCount}</strong> / ${total} contactados hoy
            ${searchQuery || activeFilter !== 'all' ? ` &nbsp;·&nbsp; <strong>${list.length}</strong> resultados` : ''}
        </div>`;

    if (list.length === 0) {
        container.innerHTML = stats + `
            <div class="empty-state">
                <h3>Sin resultados</h3>
                <p>${searchQuery ? 'No hay clientes que coincidan con la búsqueda.' : 'No hay clientes en esta categoría.'}</p>
            </div>`;
        return;
    }

    const cards = list.map(c => buildCard(c, contacted[c._idx])).join('');
    container.innerHTML = stats + cards;
}

function buildCard(client, contactLog) {
    const isContacted = !!contactLog;

    // Teléfonos disponibles
    const phonePairs = [
        ['Tel.1', client.telefono],
        ['Tel.2', client.tel2],
        ['Tel.3', client.tel3]
    ].filter(([, num]) => num && String(num).trim() !== '');

    const badgeHtml = isContacted
        ? `<span class="contacted-badge">✓ ${esc(contactLog.type)} ${esc(contactLog.time)}</span>`
        : '';

    const metaHtml = [
        client.dni           && `<span class="tag">DNI ${esc(client.dni)}</span>`,
        client.ultima_compra && `<span class="tag">Últ. compra: ${esc(client.ultima_compra)}</span>`
    ].filter(Boolean).join('');

    const phonesHtml = phonePairs.length === 0
        ? `<p class="no-phone">Sin teléfono registrado</p>`
        : phonePairs.map(([label, num]) => `
            <div class="phone-row">
                <span class="phone-label">${esc(label)}</span>
                <span class="phone-number">${esc(num)}</span>
                <div class="contact-btns">
                    <button class="btn-contact btn-call" title="Llamar"
                        onclick="handleContact(${client._idx}, '${esc(num)}', 'llamada')">📞</button>
                    <button class="btn-contact btn-sms" title="SMS"
                        onclick="handleContact(${client._idx}, '${esc(num)}', 'sms')">✉️</button>
                    <button class="btn-contact btn-wa" title="WhatsApp"
                        onclick="handleContact(${client._idx}, '${esc(num)}', 'whatsapp')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                    </button>
                </div>
            </div>`).join('');

    return `
        <div class="client-card ${isContacted ? 'contacted' : ''}">
            <div class="client-header">
                <div class="client-name">${esc(client.nombre || 'Sin nombre')}</div>
                ${badgeHtml}
            </div>
            ${metaHtml ? `<div class="client-meta">${metaHtml}</div>` : ''}
            <div class="phone-list">${phonesHtml}</div>
        </div>`;
}

// ─── Acciones de contacto ─────────────────────────────────────────────────────

function handleContact(clientIdx, phone, type) {
    const client = allClients[clientIdx];
    if (!client) return;

    markContacted(clientIdx, type, phone);
    renderClients();

    // Registrar en GitHub (best-effort, no bloquea la UX)
    const entry = {
        date:         new Date().toISOString().split('T')[0],
        time:         new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
        username:     session.username,
        branch:       session.branch,
        client_dni:   client.dni   || '',
        client_name:  client.nombre || '',
        contact_type: type,
        phone_used:   phone
    };
    writeLog(entry).catch(err => console.warn('No se pudo guardar el log:', err));

    // Abrir la app correspondiente
    const cleanPhone = phone.replace(/\s/g, '');
    setTimeout(() => {
        if (type === 'llamada') {
            window.location.href = `tel:${cleanPhone}`;
        } else if (type === 'sms') {
            window.location.href = `sms:${cleanPhone}`;
        } else if (type === 'whatsapp') {
            const digits = cleanPhone.replace(/\D/g, '');
            const local  = digits.startsWith('0') ? digits.slice(1) : digits;
            const number = '54' + local;
            const nombre = (client.nombre || '').trim();
            const msg = 'Hola ' + nombre + ' te hablamos de MARATHON DEPORTES ,hace tiempo que no compras con credito personal y tenemos una promocion para ofrecerte!!\n3 Cuotas sin interes en marcas seleccionadas!! \nEntra a este link y descubri mas promociones para vos!! https://catalogo.maromega.com.ar/';
            window.open('https://wa.me/' + number + '?text=' + encodeURIComponent(msg), '_blank');
        }
    }, 80);
}

// ─── Log a GitHub API ─────────────────────────────────────────────────────────

async function writeLog(entry) {
    const token = localStorage.getItem('vt_logs_token') || '';
    if (!token) return;

    const path   = `data/logs/${entry.date}.json`;
    const apiUrl = `${CONFIG.API_BASE}/${path}`;
    const headers = {
        'Authorization': `token ${token}`,
        'Accept':        'application/vnd.github.v3+json',
        'Content-Type':  'application/json'
    };

    // Obtener contenido actual del archivo (si existe)
    let currentLogs = [];
    let fileSha     = null;
    const getResp   = await fetch(apiUrl, { headers });
    if (getResp.ok) {
        const data = await getResp.json();
        fileSha     = data.sha;
        currentLogs = JSON.parse(atob(data.content.replace(/\n/g, '')));
    }

    currentLogs.push(entry);

    // base64 encoding compatible con UTF-8
    const jsonStr    = JSON.stringify(currentLogs, null, 2);
    const newContent = btoa(unescape(encodeURIComponent(jsonStr)));

    const body = {
        message: `log: ${entry.username} › ${entry.contact_type} › ${entry.client_name}`,
        content: newContent,
        branch:  CONFIG.GITHUB_BRANCH
    };
    if (fileSha) body.sha = fileSha;

    const putResp = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!putResp.ok) {
        const err = await putResp.text();
        throw new Error(`GitHub API ${putResp.status}: ${err.slice(0, 120)}`);
    }
}

// ─── Controles de filtro y búsqueda ──────────────────────────────────────────

function setFilter(filter, btn) {
    activeFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderClients();
}

function onSearch() {
    searchQuery = document.getElementById('searchInput').value.trim();
    renderClients();
}

// ─── Arranque ─────────────────────────────────────────────────────────────────

(async function init() {
    const container = document.getElementById('clientList');
    try {
        allClients = await loadClients();
        renderClients();
    } catch (e) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Error al cargar</h3>
                <p>${esc(e.message)}</p>
                <br>
                <button onclick="location.reload()" style="
                    padding:10px 24px;border:none;border-radius:8px;
                    background:#1a73e8;color:white;font-size:15px;cursor:pointer">
                    Reintentar
                </button>
            </div>`;
    }
})();
