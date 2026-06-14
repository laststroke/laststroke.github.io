const firebaseConfig = {
    apiKey: "AIzaSyCBFEWZZxxs9wlWt-7rtOJAHl1eEusebH8",
    authDomain: "sitekapo.firebaseapp.com",
    projectId: "sitekapo",
    storageBucket: "sitekapo.firebasestorage.app",
    messagingSenderId: "37856573246",
    appId: "1:37856573246:web:ccec1cf51e5b9562405e6f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

let editingProductId = null;
let editingServiceId = null;
let productsData = [];
let servicesData = [];
let pendingDeleteCallback = null;

function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    str = String(str);
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = 'notification';
    if (type === 'error') notification.classList.add('error');
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function formatDate(timestamp) {
    if (!timestamp) return '—';
    if (timestamp.toDate) return timestamp.toDate().toLocaleString('ru-RU');
    return new Date(timestamp).toLocaleString('ru-RU');
}

function getStatusClass(status) {
    switch(status) {
        case 'новая': return 'status-new';
        case 'обработка': return 'status-processing';
        case 'выполнен': return 'status-completed';
        case 'отменен': return 'status-cancelled';
        default: return '';
    }
}

function showAdminConfirm(message, onConfirm) {
    const modal = document.getElementById('adminConfirmModal');
    const msg = document.getElementById('adminConfirmMessage');
    if (!modal || !msg) { if (confirm(message)) onConfirm(); return; }
    msg.textContent = message;
    modal.style.display = 'flex';
    pendingDeleteCallback = onConfirm;
}

function closeAdminConfirm() {
    const modal = document.getElementById('adminConfirmModal');
    if (modal) modal.style.display = 'none';
    pendingDeleteCallback = null;
}

function initAdminConfirmModal() {
    const okBtn = document.getElementById('adminConfirmOk');
    const cancelBtn = document.getElementById('adminConfirmCancel');
    const closeBtn = document.querySelector('#adminConfirmModal .confirm-modal-close');
    if (okBtn) okBtn.addEventListener('click', function() { if (pendingDeleteCallback) pendingDeleteCallback(); closeAdminConfirm(); });
    if (cancelBtn) cancelBtn.addEventListener('click', closeAdminConfirm);
    if (closeBtn) closeBtn.addEventListener('click', closeAdminConfirm);
}

async function getAllOrders() {
    try {
        const q = db.collection("orders").orderBy("createdAt", "desc");
        const snapshot = await q.get();
        const orders = [];
        snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
        return orders;
    } catch (error) {
        console.error("Error loading orders:", error);
        return [];
    }
}

async function renderOrders() {
    const orders = await getAllOrders();
    const ordersList = document.getElementById('ordersList');
    if (orders.length === 0) {
        ordersList.innerHTML = '<tr><td colspan="8" class="text-center">Нет заказов</td></tr>';
        return;
    }
    ordersList.innerHTML = orders.map(order => {
        const statusClass = getStatusClass(order.status);
        const itemsPreview = order.items?.map(i => `${escapeHtml(i.name)} (${i.quantity} шт.)`).join(', ') || '—';
        return `
            <tr>
                <td>${escapeHtml(order.id.slice(-6))}</td>
                <td>${escapeHtml(order.customerName)}</td>
                <td>${escapeHtml(order.customerPhone)}</td>
                <td><div class="items-preview">${itemsPreview}</div></td>
                <td><strong>${(order.totalAmount || 0).toLocaleString()} ₽</strong></td>
                <td>
                    <select class="status-select ${statusClass}" data-order-id="${order.id}">
                        <option value="новая" ${order.status === 'новая' ? 'selected' : ''}>Новая</option>
                        <option value="обработка" ${order.status === 'обработка' ? 'selected' : ''}>В обработке</option>
                        <option value="выполнен" ${order.status === 'выполнен' ? 'selected' : ''}>Выполнен</option>
                        <option value="отменен" ${order.status === 'отменен' ? 'selected' : ''}>Отменен</option>
                    </select>
                </td>
                <td>${formatDate(order.createdAt)}</td>
                <td><button class="btn-small btn-delete" data-order-id="${order.id}"><i class="fas fa-trash"></i></button></td>
            </tr>
        `;
    }).join('');
    document.querySelectorAll('.status-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const orderId = e.target.dataset.orderId;
            const newStatus = e.target.value;
            try {
                await db.collection("orders").doc(orderId).update({ status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                showNotification('Статус обновлен');
                await renderOrders();
                await updateStats();
            } catch (error) { showNotification('Ошибка при обновлении статуса', 'error'); }
        });
    });
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const orderId = btn.dataset.orderId;
            showAdminConfirm('Удалить заказ? Это действие нельзя отменить.', async () => {
                try {
                    await db.collection("orders").doc(orderId).delete();
                    showNotification('Заказ удален');
                    await renderOrders();
                    await updateStats();
                } catch (error) { showNotification('Ошибка при удалении заказа', 'error'); }
            });
        });
    });
}

async function loadProductsForAdmin() {
    const container = document.getElementById('productsAdminGrid');
    if (!container) return;
    container.innerHTML = '<div class="loading">Загрузка товаров...</div>';
    try {
        const snapshot = await db.collection('products').get();
        const products = [];
        snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
        productsData = products;
        if (products.length === 0) { container.innerHTML = '<div class="text-center">Нет добавленных товаров</div>'; return; }
        container.innerHTML = products.map(p => `
            <div class="product-admin-card">
                <div class="product-admin-image"><img src="${p.image || 'https://placehold.co/300x180?text=Нет+фото'}" onerror="this.src='https://placehold.co/300x180?text=Нет+фото'"></div>
                <div class="product-admin-info">
                    <div class="product-admin-name">${escapeHtml(p.name)}</div>
                    <div class="product-admin-price">${(p.price || 0).toLocaleString()} ₽</div>
                    <div class="product-admin-category">${p.category || 'Без категории'}</div>
                    <div class="product-admin-badge">${p.badge ? escapeHtml(p.badge) : '—'}</div>
                    <div class="product-admin-actions">
                        <button class="edit-product-btn" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i> Редактировать</button>
                        <button class="delete-product-btn" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i> Удалить</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) { container.innerHTML = '<div class="text-center" style="color:#c97e4a;">Ошибка загрузки</div>'; }
}

function openProductModal(productId = null) {
    const modal = document.getElementById('productModal');
    const title = document.getElementById('productModalTitle');
    if (!modal) return;
    editingProductId = productId;
    document.getElementById('productForm').reset();
    if (productId) {
        title.innerHTML = '<i class="fas fa-edit"></i> Редактировать товар';
        const product = productsData.find(p => p.id === productId);
        if (product) {
            document.getElementById('productName').value = product.name || '';
            document.getElementById('productArtist').value = product.artist || '';
            document.getElementById('productDescription').value = product.description || '';
            document.getElementById('productPrice').value = product.price || '';
            document.getElementById('productCategory').value = product.category || 'картины';
            document.getElementById('productImage').value = product.image || '';
            document.getElementById('productBadge').value = product.badge || '';
        }
    } else {
        title.innerHTML = '<i class="fas fa-plus-circle"></i> Добавить товар';
        document.getElementById('productBadge').value = '';
    }
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    editingProductId = null;
}

async function saveProduct(e) {
    e.preventDefault();
    const productData = {
        name: document.getElementById('productName').value.trim(),
        artist: document.getElementById('productArtist').value.trim() || 'Современный художник',
        description: document.getElementById('productDescription').value.trim(),
        price: parseInt(document.getElementById('productPrice').value),
        category: document.getElementById('productCategory').value,
        image: document.getElementById('productImage').value.trim() || 'https://placehold.co/600x400?text=Нет+фото',
        badge: document.getElementById('productBadge').value
    };
    if (!productData.name || !productData.price || productData.price <= 0) {
        showNotification('Заполните название и цену (больше 0)', 'error');
        return;
    }
    try {
        if (editingProductId) {
            await db.collection('products').doc(editingProductId).update(productData);
            showNotification('Товар обновлен');
        } else {
            await db.collection('products').add(productData);
            showNotification('Товар добавлен');
        }
        closeProductModal();
        await loadProductsForAdmin();
        await updateStats();
    } catch (error) {
        console.error(error);
        showNotification('Ошибка при сохранении товара', 'error');
    }
}

window.editProduct = function(id) { openProductModal(id); };
window.deleteProduct = async function(id) {
    showAdminConfirm('Удалить товар? Это действие нельзя отменить.', async () => {
        try {
            await db.collection('products').doc(id).delete();
            showNotification('Товар удален');
            await loadProductsForAdmin();
            await updateStats();
        } catch (error) { showNotification('Ошибка при удалении', 'error'); }
    });
};

async function loadServicesForAdmin() {
    const container = document.getElementById('servicesAdminGrid');
    if (!container) return;
    container.innerHTML = '<div class="loading">Загрузка услуг...</div>';
    try {
        const snapshot = await db.collection('services').get();
        if (snapshot.empty) { container.innerHTML = '<div class="text-center">Нет добавленных услуг</div>'; return; }
        const services = [];
        snapshot.forEach(doc => services.push({ id: doc.id, ...doc.data() }));
        servicesData = services;
        let html = '';
        for (let s of services) {
            let featuresPreview = '';
            if (s.features && Array.isArray(s.features)) {
                featuresPreview = s.features.slice(0, 2).join(', ');
                if (s.features.length > 2) featuresPreview += '...';
            } else if (typeof s.features === 'string' && s.features.trim()) {
                const lines = s.features.split('\n').filter(l => l.trim());
                featuresPreview = lines.slice(0, 2).join(', ');
                if (lines.length > 2) featuresPreview += '...';
            }
            html += `
                <div class="service-admin-card">
                    <div class="service-admin-info">
                        <div class="service-admin-name">${escapeHtml(s.name)}</div>
                        <div class="service-admin-price">${escapeHtml(s.price || '—')}</div>
                        <div class="service-admin-features">${escapeHtml(featuresPreview)}</div>
                        <div class="service-admin-actions">
                            <button class="edit-service-btn" onclick="editService('${s.id}')"><i class="fas fa-edit"></i> Редактировать</button>
                            <button class="delete-service-btn" onclick="deleteService('${s.id}')"><i class="fas fa-trash"></i> Удалить</button>
                        </div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } catch (error) { container.innerHTML = '<div class="text-center" style="color:#c97e4a;">Ошибка загрузки</div>'; }
}

async function loadServiceOrdersForAdmin() {
    const container = document.getElementById('serviceOrdersList');
    if (!container) return;
    container.innerHTML = '<div class="loading">Загрузка заявок...</div>';
    try {
        const snapshot = await db.collection('service_orders').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) { container.innerHTML = '<div class="text-center">Нет заявок на услуги</div>'; return; }
        const orders = [];
        snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
        let html = '<table class="orders-table"><thead><tr><th>№</th><th>Услуга</th><th>Клиент</th><th>Email</th><th>Статус</th><th>Дата</th><th>Действия</th></tr></thead><tbody>';
        for (let order of orders) {
            html += `
                <tr>
                    <td>${escapeHtml(order.id.slice(-6))}</td>
                    <td>${escapeHtml(order.serviceName)}</td>
                    <td>${escapeHtml(order.userName)}</td>
                    <td>${escapeHtml(order.userEmail)}</td>
                    <td>
                        <select class="status-select service-status-select" data-order-id="${order.id}">
                            <option value="новая" ${order.status === 'новая' ? 'selected' : ''}>Новая</option>
                            <option value="обработка" ${order.status === 'обработка' ? 'selected' : ''}>В обработке</option>
                            <option value="выполнена" ${order.status === 'выполнена' ? 'selected' : ''}>Выполнена</option>
                            <option value="отменена" ${order.status === 'отменена' ? 'selected' : ''}>Отменена</option>
                        </select>
                    </td>
                    <td>${formatDate(order.createdAt)}</td>
                    <td><button class="btn-small btn-delete-service" data-order-id="${order.id}"><i class="fas fa-trash"></i></button></td>
                </tr>
            `;
        }
        html += '</tbody></table>';
        container.innerHTML = html;
        document.querySelectorAll('.service-status-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const orderId = e.target.dataset.orderId;
                const newStatus = e.target.value;
                await db.collection('service_orders').doc(orderId).update({ status: newStatus });
                showNotification('Статус обновлен');
                loadServiceOrdersForAdmin();
            });
        });
        document.querySelectorAll('.btn-delete-service').forEach(btn => {
            btn.addEventListener('click', () => {
                const orderId = btn.dataset.orderId;
                showAdminConfirm('Удалить заявку на услугу? Это действие нельзя отменить.', async () => {
                    await db.collection('service_orders').doc(orderId).delete();
                    showNotification('Заявка удалена');
                    loadServiceOrdersForAdmin();
                });
            });
        });
    } catch (error) { container.innerHTML = '<div class="text-center" style="color:#c97e4a;">Ошибка загрузки</div>'; }
}

function openServiceModal(serviceId = null) {
    const modal = document.getElementById('serviceModal');
    const title = document.getElementById('serviceModalTitle');
    if (!modal) return;
    editingServiceId = serviceId;
    document.getElementById('serviceForm').reset();
    if (serviceId) {
        title.innerHTML = '<i class="fas fa-edit"></i> Редактировать услугу';
        const service = servicesData.find(s => s.id === serviceId);
        if (service) {
            document.getElementById('serviceName').value = service.name || '';
            document.getElementById('serviceDescription').value = service.description || '';
            document.getElementById('serviceFullDescription').value = service.fullDescription || '';
            document.getElementById('serviceImage').value = service.image || '';
            document.getElementById('servicePrice').value = service.price || '';
            document.getElementById('serviceOrderButtonText').value = service.orderButtonText || '';
            if (service.features && Array.isArray(service.features)) {
                document.getElementById('serviceFeatures').value = service.features.join('\n');
            } else if (typeof service.features === 'string') {
                document.getElementById('serviceFeatures').value = service.features;
            }
        }
    } else {
        title.innerHTML = '<i class="fas fa-plus-circle"></i> Добавить услугу';
    }
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeServiceModal() {
    const modal = document.getElementById('serviceModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    editingServiceId = null;
}

async function saveService(e) {
    e.preventDefault();
    const name = document.getElementById('serviceName').value.trim();
    const description = document.getElementById('serviceDescription').value.trim();
    if (!name || !description) {
        showNotification('Заполните название и краткое описание', 'error');
        return;
    }
    const featuresText = document.getElementById('serviceFeatures').value;
    const features = featuresText ? featuresText.split('\n').filter(line => line.trim().length > 0) : [];
    const serviceData = {
        name: name, description: description,
        fullDescription: document.getElementById('serviceFullDescription').value.trim() || '',
        image: document.getElementById('serviceImage').value.trim() || '',
        price: document.getElementById('servicePrice').value.trim() || 'По запросу',
        features: features,
        orderButtonText: document.getElementById('serviceOrderButtonText').value.trim() || 'Заказать',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        if (editingServiceId) {
            await db.collection('services').doc(editingServiceId).update(serviceData);
            showNotification('Услуга обновлена');
        } else {
            serviceData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('services').add(serviceData);
            showNotification('Услуга добавлена');
        }
        closeServiceModal();
        await loadServicesForAdmin();
    } catch (error) {
        console.error(error);
        showNotification('Ошибка при сохранении услуги', 'error');
    }
}

window.editService = function(id) { openServiceModal(id); };
window.deleteService = async function(id) {
    showAdminConfirm('Удалить услугу? Это действие нельзя отменить.', async () => {
        try {
            await db.collection('services').doc(id).delete();
            showNotification('Услуга удалена');
            await loadServicesForAdmin();
        } catch (error) { showNotification('Ошибка при удалении', 'error'); }
    });
};

async function updateStats() {
    const orders = await getAllOrders();
    document.getElementById('totalOrders').textContent = orders.length;
    document.getElementById('newOrders').textContent = orders.filter(o => o.status === 'новая').length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    document.getElementById('totalRevenue').textContent = totalRevenue.toLocaleString() + ' ₽';
    const productsSnapshot = await db.collection('products').get();
    document.getElementById('totalProducts').textContent = productsSnapshot.size;
    document.getElementById('statsTotalOrders').textContent = orders.length;
    document.getElementById('statsTotalRevenue').textContent = totalRevenue.toLocaleString() + ' ₽';
    document.getElementById('statsAverageCheck').textContent = orders.length > 0 ? Math.round(totalRevenue / orders.length).toLocaleString() + ' ₽' : '0 ₽';
    const productCount = {};
    orders.forEach(order => { if (order.items) order.items.forEach(item => productCount[item.name] = (productCount[item.name] || 0) + item.quantity); });
    let topProduct = '—', topCount = 0;
    for (const [name, count] of Object.entries(productCount)) if (count > topCount) { topCount = count; topProduct = name; }
    document.getElementById('statsTopProduct').textContent = topProduct.length > 30 ? topProduct.slice(0,30)+'...' : topProduct;
}

async function adminLogin() {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const loginMessage = document.getElementById('loginMessage');
    if (!email || !password) { loginMessage.textContent = 'Заполните email и пароль'; return; }
    if (email !== 'laststroke@admin.ru') { loginMessage.textContent = 'Доступ только для администратора'; return; }
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        if (error.code === 'auth/invalid-credential') loginMessage.textContent = 'Неверный email или пароль';
        else if (error.code === 'auth/too-many-requests') loginMessage.textContent = 'Слишком много попыток. Попробуйте позже.';
        else loginMessage.textContent = 'Ошибка входа. Проверьте данные.';
    }
}

async function adminLogout() { window.location.href = 'index.html'; }

function initTabs() {
    const tabs = document.querySelectorAll('.admin-tab-btn');
    const contents = document.querySelectorAll('.admin-tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');
            if (tabId === 'orders') renderOrders();
            if (tabId === 'products') loadProductsForAdmin();
            if (tabId === 'services') loadServicesForAdmin();
            if (tabId === 'serviceorders') loadServiceOrdersForAdmin();
            if (tabId === 'stats') updateStats();
        });
    });
}

function initModals() {
    const productModal = document.getElementById('productModal');
    const serviceModal = document.getElementById('serviceModal');
    window.addEventListener('click', (e) => {
        if (e.target === productModal) closeProductModal();
        if (e.target === serviceModal) closeServiceModal();
    });
    document.querySelectorAll('.modal-close, .product-cancel, .service-cancel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.closest('#productModal')) closeProductModal();
            if (btn.closest('#serviceModal')) closeServiceModal();
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initAdminConfirmModal();
    initModals();
    document.getElementById('loginBtn')?.addEventListener('click', adminLogin);
    document.getElementById('logoutBtn')?.addEventListener('click', adminLogout);
    document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());
    document.getElementById('addServiceBtn')?.addEventListener('click', () => openServiceModal());
    document.getElementById('refreshStatsBtn')?.addEventListener('click', updateStats);
    document.getElementById('productForm')?.addEventListener('submit', saveProduct);
    document.getElementById('serviceForm')?.addEventListener('submit', saveService);
    document.getElementById('adminPassword')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') adminLogin(); });
    document.getElementById('adminEmail')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') adminLogin(); });
    
    auth.onAuthStateChanged((user) => {
        if (user && user.email === 'laststroke@admin.ru') {
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            renderOrders();
            loadProductsForAdmin();
            loadServicesForAdmin();
            loadServiceOrdersForAdmin();
            updateStats();
        } else if (user) { window.location.href = 'index.html'; }
        else {
            document.getElementById('loginForm').style.display = 'flex';
            document.getElementById('adminPanel').style.display = 'none';
        }
    });
});