// ------------------- Firebase Config ------------------------
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

// ------------------- Глобальные переменные -------------------
let productsData = [];
let servicesData = [];
let cart = JSON.parse(localStorage.getItem('cart_artgallery')) || [];
let favorites = JSON.parse(localStorage.getItem('favorites_artgallery')) || [];
let currentUser = null;
let currentFilter = 'all';
let currentPage = 1;
const itemsPerPage = 8;
let filterTimeout = null;

// ------------------- Карта размеров товаров -----------------
const productSizesMap = {
    'картины': [
        { name: '30x40 см', percent: 100 },
        { name: '50x70 см', percent: 180 },
        { name: '70x100 см', percent: 300 }
    ],
    'постеры': [
        { name: 'A4 (21x30 см)', percent: 100 },
        { name: 'A3 (30x42 см)', percent: 167 },
        { name: 'A2 (42x60 см)', percent: 292 }
    ],
    'репродукции': [
        { name: '30x40 см', percent: 100 },
        { name: '50x70 см', percent: 180 },
        { name: '70x100 см', percent: 300 }
    ],
    'модульные картины': [
        { name: '2 модуля', percent: 100 },
        { name: '3 модуля', percent: 143 },
        { name: '4 модуля', percent: 187 }
    ]
};

function getProductSizes(product) {
    const sizes = productSizesMap[product.category];
    if (!sizes) return [{ name: 'Стандартный размер', price: product.price }];
    return sizes.map(s => ({ name: s.name, price: Math.round(product.price * s.percent / 100) }));
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notifications');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = 'notification';
    if (type === 'error') notification.classList.add('error');
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// ---------- ИНДИКАТОР ЗАГРУЗКИ ----------
function showPageLoader() {
    let loader = document.querySelector('.page-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.className = 'page-loader';
        loader.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(loader);
    }
    // Принудительно показываем
    loader.style.visibility = 'visible';
    loader.style.opacity = '1';
    loader.classList.add('active');
}

function hidePageLoader() {
    const loader = document.querySelector('.page-loader');
    if (loader) loader.classList.remove('active');
}

// ---------- ЗАГРУЗКА ДАННЫХ ИЗ FIREBASE ----------
async function loadProductsFromFirebase() {
    try {
        const snapshot = await db.collection('products').get();
        if (snapshot.empty) { productsData = []; return; }
        productsData = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.material) {
                if (data.category === 'картины') data.material = 'Масло, холст';
                else if (data.category === 'постеры') data.material = 'Цифровая печать, матовая бумага';
                else if (data.category === 'репродукции') data.material = 'Холст, масло (репродукция)';
                else if (data.category === 'модульные картины') data.material = 'Холст, модульная конструкция';
                else data.material = 'Смешанная техника';
            }
            if (data.category === 'репродукции' && !data.artist) {
                data.artist = 'Александр Волков';
            }
            productsData.push({ id: doc.id, ...data });
        });
        console.log('Загружено товаров:', productsData.length);
        renderBestsellers();
        if (document.getElementById('catalogGrid')) doFilterAndRender();
        if (document.getElementById('productDetail')) loadProductDetail();
    } catch (error) {
        console.error(error);
        showNotification('Ошибка загрузки товаров');
    }
}

async function loadServicesFromFirebase() {
    try {
        const snapshot = await db.collection('services').get();
        if (snapshot.empty) { servicesData = []; return; }
        servicesData = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.features && !Array.isArray(data.features)) {
                if (typeof data.features === 'string') data.features = data.features.split('\n').filter(l => l.trim());
                else data.features = [];
            }
            servicesData.push({ id: doc.id, ...data });
        });
        console.log('Загружено услуг:', servicesData.length);
        renderServicesPage();
        renderServicesPreview();
        updateFooterServiceLinks();
        if (document.getElementById('serviceDetail')) loadServiceDetail();
    } catch (error) {
        console.error(error);
        showNotification('Ошибка загрузки услуг');
    }
}

function updateFooterServiceLinks() {
    const serviceLinks = document.querySelectorAll('.service-footer-link');
    if (serviceLinks.length === 0) return;
    const serviceNameToId = {};
    servicesData.forEach(s => { serviceNameToId[s.name] = s.id; });
    serviceLinks.forEach(link => {
        const serviceName = link.getAttribute('data-service-name');
        if (serviceName && serviceNameToId[serviceName]) {
            link.href = `service-detail.html?id=${serviceNameToId[serviceName]}`;
            link.setAttribute('onclick', 'showPageLoader();');
        } else {
            link.href = 'services.html';
        }
    });
}

// ---------- КОРЗИНА И ИЗБРАННОЕ ----------
function updateCartCounters() {
    const cartCount = cart.reduce((s, i) => s + (i.quantity || 1), 0);
    const cartTotal = cart.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
    if (document.getElementById('cartCount')) document.getElementById('cartCount').textContent = cartCount;
    if (document.getElementById('cartTotal')) document.getElementById('cartTotal').textContent = cartTotal.toLocaleString() + ' ₽';
    if (document.getElementById('favoritesCount')) document.getElementById('favoritesCount').textContent = favorites.length;
}

function renderCart() {
    const container = document.getElementById('cartItems');
    if (!container) return;
    if (cart.length === 0) {
        container.innerHTML = '<div class="empty-cart" style="text-align:center;padding:60px 20px;"><i class="fas fa-shopping-bag"></i><p>Корзина пуста</p></div>';
        updateCartCounters();
        return;
    }
    let html = '';
    for (let item of cart) {
        const qty = item.quantity || 1;
        const sizeText = item.selectedSizeName ? ` (${item.selectedSizeName})` : '';
        html += `
            <div class="cart-item">
                <img src="${item.image}" alt="${escapeHtml(item.name)}">
                <div class="cart-item-info">
                    <div class="cart-item-title">${escapeHtml(item.name)}${sizeText}</div>
                    <div class="cart-item-price">${(item.price * qty).toLocaleString()} ₽</div>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateQuantity('${item.id}', ${qty - 1})">-</button>
                        <span>${qty}</span>
                        <button class="quantity-btn" onclick="updateQuantity('${item.id}', ${qty + 1})">+</button>
                    </div>
                </div>
                <button class="cart-item-remove" onclick="confirmRemoveFromCart('${item.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
    }
    container.innerHTML = html;
    updateCartCounters();
}

function renderFavorites() {
    const container = document.getElementById('favoritesItems');
    if (!container) return;
    
    if (favorites.length === 0) {
        container.innerHTML = '<div class="empty-cart" style="text-align:center;padding:60px 20px;"><i class="far fa-heart"></i><p>Избранное пусто</p></div>';
        return;
    }
    
    let html = '';
    for (let item of favorites) {
        // Показываем размер, если он есть
        const sizeText = item.selectedSizeName ? ` (${item.selectedSizeName})` : '';
        
        html += `
            <div class="cart-item">
                <img src="${item.image}" alt="${escapeHtml(item.name)}">
                <div class="cart-item-info">
                    <div class="cart-item-title">${escapeHtml(item.name)}${sizeText}</div>
                    <div class="cart-item-price">${item.price.toLocaleString()} ₽</div>
                    <button class="btn-outline" style="padding:6px 12px;margin-top:8px;" onclick="addToCartFromFavorite('${item.id}', '${item.selectedSizeName || ''}')">В корзину</button>
                </div>
                <button class="cart-item-remove" onclick="toggleFavorite('${item.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
    }
    container.innerHTML = html;
}

function addToCart(productId) {
    const product = productsData.find(p => p.id === productId);
    if (!product) return;
    const existing = cart.find(i => i.id === productId);
    if (existing) existing.quantity = (existing.quantity || 1) + 1;
    else cart.push({ ...product, quantity: 1 });
    localStorage.setItem('cart_artgallery', JSON.stringify(cart));
    updateCartCounters();
    renderCart();
    showNotification('Добавлено в корзину');
}

function addToCartFromFavorite(productId, selectedSizeName) {
    const product = productsData.find(p => p.id === productId);
    if (!product) return;
    
    let finalPrice = product.price;
    let finalSizeName = 'Стандартный размер';
    
    // Если размер был сохранён в избранном
    if (selectedSizeName && selectedSizeName !== '') {
        finalSizeName = selectedSizeName;
        // Находим цену для этого размера
        const sizes = getProductSizes(product);
        const foundSize = sizes.find(s => s.name === selectedSizeName);
        if (foundSize) {
            finalPrice = foundSize.price;
        }
    } else {
        // Если размера нет, пробуем найти в избранном
        const favItem = favorites.find(f => f.id === productId);
        if (favItem && favItem.selectedSizeName) {
            finalSizeName = favItem.selectedSizeName;
            const sizes = getProductSizes(product);
            const foundSize = sizes.find(s => s.name === finalSizeName);
            if (foundSize) {
                finalPrice = foundSize.price;
            }
        }
    }
    
    const existing = cart.find(i => i.id === productId && i.selectedSizeName === finalSizeName);
    if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
    } else {
        cart.push({ ...product, price: finalPrice, quantity: 1, selectedSizeName: finalSizeName });
    }
    
    localStorage.setItem('cart_artgallery', JSON.stringify(cart));
    updateCartCounters();
    renderCart();
    showNotification(`Добавлено в корзину (${finalSizeName})`);
}


function addToCartWithSize(productId) {
    const product = productsData.find(p => p.id === productId);
    if (!product) return;
    let selectedPrice = product.price;
    let selectedSizeName = 'Стандартный размер';
    const sizeSelect = document.querySelector(`.size-select[data-product="${productId}"]`);
    if (sizeSelect && sizeSelect.options.length > 0) {
        selectedPrice = parseInt(sizeSelect.value);
        selectedSizeName = sizeSelect.options[sizeSelect.selectedIndex].dataset.sizeName;
    }
    const existing = cart.find(i => i.id === productId && i.selectedSizeName === selectedSizeName);
    if (existing) existing.quantity = (existing.quantity || 1) + 1;
    else cart.push({ ...product, price: selectedPrice, quantity: 1, selectedSizeName });
    localStorage.setItem('cart_artgallery', JSON.stringify(cart));
    updateCartCounters();
    renderCart();
    showNotification(`Добавлено в корзину (${selectedSizeName})`);
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.id !== productId);
    localStorage.setItem('cart_artgallery', JSON.stringify(cart));
    updateCartCounters();
    renderCart();
    showNotification('Удалено из корзины');
}

function confirmRemoveFromCart(productId) {
    confirmAction('Вы уверены, что хотите удалить этот товар из корзины?', () => {
        removeFromCart(productId);
    });
}

function updateQuantity(productId, newQuantity) {
    if (newQuantity < 1) return;
    const item = cart.find(i => i.id === productId);
    if (item) {
        item.quantity = newQuantity;
        localStorage.setItem('cart_artgallery', JSON.stringify(cart));
        updateCartCounters();
        renderCart();
    }
}

function toggleFavorite(productId) {
    const product = productsData.find(p => p.id === productId);
    if (!product) return;
    
    // Определяем, с каким размером добавляем в избранное
    let selectedSizeName = null;
    let selectedPrice = product.price;
    
    // Ищем выбранный размер на странице (если мы на детальной странице товара)
    const sizeSelect = document.getElementById('product-size-select');
    if (sizeSelect && sizeSelect.options.length > 0) {
        const selectedOption = sizeSelect.options[sizeSelect.selectedIndex];
        selectedSizeName = selectedOption.dataset.sizeName;
        selectedPrice = parseInt(sizeSelect.value);
    }
    
    // Ищем также в карточках каталога
    if (!selectedSizeName) {
        const sizeSelectInCard = document.querySelector(`.size-select[data-product="${productId}"]`);
        if (sizeSelectInCard && sizeSelectInCard.options.length > 0) {
            const selectedOption = sizeSelectInCard.options[sizeSelectInCard.selectedIndex];
            selectedSizeName = selectedOption.dataset.sizeName;
            selectedPrice = parseInt(sizeSelectInCard.value);
        }
    }
    
    const index = favorites.findIndex(f => f.id === productId);
    
    if (index === -1) {
        // Добавляем в избранное с выбранным размером
        const favoriteItem = { 
            ...product, 
            selectedSizeName: selectedSizeName || null,
            price: selectedPrice || product.price
        };
        favorites.push(favoriteItem);
        showNotification('Добавлено в избранное');
    } else {
        favorites.splice(index, 1);
        showNotification('Удалено из избранного');
    }
    
    localStorage.setItem('favorites_artgallery', JSON.stringify(favorites));
    updateCartCounters();
    renderFavorites();
    renderBestsellers();
    if (document.getElementById('catalogGrid')) doFilterAndRender();
    if (document.getElementById('productDetail')) loadProductDetail();
}

// ---------- КАСТОМНОЕ ПОДТВЕРЖДЕНИЕ ----------
function confirmAction(message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const msg = document.getElementById('confirmMessage');
    if (!modal || !msg) {
        if (confirm(message)) onConfirm();
        return;
    }
    msg.textContent = message;
    modal.style.display = 'flex';
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    const closeBtn = document.querySelector('#confirmModal .confirm-modal-close');
    const handlerOk = () => {
        modal.style.display = 'none';
        ok.removeEventListener('click', handlerOk);
        cancel.removeEventListener('click', handlerCancel);
        if (closeBtn) closeBtn.removeEventListener('click', handlerCancel);
        onConfirm();
    };
    const handlerCancel = () => {
        modal.style.display = 'none';
        ok.removeEventListener('click', handlerOk);
        cancel.removeEventListener('click', handlerCancel);
        if (closeBtn) closeBtn.removeEventListener('click', handlerCancel);
    };
    ok.addEventListener('click', handlerOk);
    cancel.addEventListener('click', handlerCancel);
    if (closeBtn) closeBtn.addEventListener('click', handlerCancel);
}

// ---------- ОТОБРАЖЕНИЕ ТОВАРОВ ----------
function renderBestsellers() {
    const grid = document.getElementById('bestsellersGrid');
    if (!grid) return;
    if (productsData.length === 0) {
        grid.innerHTML = '<div class="catalog-loading"><i class="fas fa-spinner fa-pulse"></i> Загрузка товаров...</div>';
        return;
    }
    const bestsellers = productsData.slice(0, 4);
    let html = '';
    for (let p of bestsellers) {
    const isFav = favorites.some(f => f.id === p.id);
    const sizes = getProductSizes(p);

    // ВСЕГДА создаём контейнер с фиксированной высотой
    let sizeHtml = '';
    let defaultPrice = p.price;

    if (sizes.length > 1) {
        // Есть выбор размера
        sizeHtml = `<div class="size-selector-container"><select class="size-select" data-product="${p.id}">${sizes.map(s => `<option value="${s.price}" ${s.price === p.price ? 'selected' : ''} data-size-name="${s.name}">${s.name}</option>`).join('')}</select></div>`;
        defaultPrice = sizes.find(s => s.price === p.price)?.price || p.price;
    } else {
        // НЕТ выбора размера – создаём ПУСТОЙ ВИДИМЫЙ блок (не hidden!)
        sizeHtml = `<div class="size-selector-container no-size"><div style="height: 44px;"></div></div>`;
    }

    let materialText = p.material;
    if (p.category === 'репродукции' && materialText) {
        materialText = materialText.replace(/\(репродукция\)/gi, '').trim();
    }

    const badgeHtml = p.badge && p.badge !== '' 
        ? `<div class="product-badge ${p.badge === 'Новинка' ? 'badge-new' : p.badge === 'Хит' ? 'badge-hit' : 'badge-sale'}">${p.badge}</div>` 
        : '';

    html += `
        <div class="product-card" data-product-id="${p.id}">
            <div class="product-image">
                ${badgeHtml}
                <img src="${p.image}" alt="${escapeHtml(p.name)}" onclick="showPageLoader(); window.location.href='product-detail.html?id=${p.id}'">
                <button class="product-fav ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${p.id}')"><i class="${isFav ? 'fas' : 'far'} fa-heart"></i></button>
            </div>
            <div class="product-info">
                <div class="product-category">${p.category === 'картины' ? 'Картина' : p.category === 'постеры' ? 'Постер' : p.category === 'модульные картины' ? 'Модульная картина' : 'Репродукция'}</div>
                <div class="product-title" onclick="showPageLoader(); window.location.href='product-detail.html?id=${p.id}'">${escapeHtml(p.name)}</div>
                ${p.artist ? `<div class="product-artist">${escapeHtml(p.artist)}</div>` : ''}
                <div class="product-material">${escapeHtml(materialText)}</div>
                ${sizeHtml}
                <div class="product-price" id="bestseller-price-${p.id}">${defaultPrice.toLocaleString()} руб.</div>
                <button class="product-add" onclick="addToCartWithSize('${p.id}')">В корзину</button>
            </div>
        </div>
    `;
    }
    grid.innerHTML = html;
    document.querySelectorAll('.size-select').forEach(select => {
        select.addEventListener('change', function() {
            const pid = this.dataset.product;
            const price = parseInt(this.value);
            document.getElementById(`bestseller-price-${pid}`).textContent = price.toLocaleString() + ' руб.';
        });
    });
}

function renderCatalog(products) {
    const grid = document.getElementById('catalogGrid');
    if (!grid) return;
    if (products.length === 0) {
        grid.innerHTML = '<div class="loading">Нет товаров</div>';
        return;
    }
    let html = '';
    for (let p of products) {
    const isFav = favorites.some(f => f.id === p.id);
    const sizes = getProductSizes(p);

    // ВСЕГДА создаём контейнер с фиксированной высотой
    let sizeHtml = '';
    let defaultPrice = p.price;

    if (sizes.length > 1) {
        // Есть выбор размера
        sizeHtml = `<div class="size-selector-container"><select class="size-select" data-product="${p.id}">${sizes.map(s => `<option value="${s.price}" ${s.price === p.price ? 'selected' : ''} data-size-name="${s.name}">${s.name}</option>`).join('')}</select></div>`;
        defaultPrice = sizes.find(s => s.price === p.price)?.price || p.price;
    } else {
        // НЕТ выбора размера – создаём ПУСТОЙ ВИДИМЫЙ блок (не hidden!)
        sizeHtml = `<div class="size-selector-container no-size"><div style="height: 44px;"></div></div>`;
    }

    let materialText = p.material;
    if (p.category === 'репродукции' && materialText) {
        materialText = materialText.replace(/\(репродукция\)/gi, '').trim();
    }

    const badgeHtml = p.badge && p.badge !== '' 
        ? `<div class="product-badge ${p.badge === 'Новинка' ? 'badge-new' : p.badge === 'Хит' ? 'badge-hit' : 'badge-sale'}">${p.badge}</div>` 
        : '';

    html += `
        <div class="product-card" data-product-id="${p.id}">
            <div class="product-image">
                ${badgeHtml}
                <img src="${p.image}" alt="${escapeHtml(p.name)}" onclick="showPageLoader(); window.location.href='product-detail.html?id=${p.id}'">
                <button class="product-fav ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${p.id}')"><i class="${isFav ? 'fas' : 'far'} fa-heart"></i></button>
            </div>
            <div class="product-info">
                <div class="product-category">${p.category === 'картины' ? 'Картина' : p.category === 'постеры' ? 'Постер' : p.category === 'модульные картины' ? 'Модульная картина' : 'Репродукция'}</div>
                <div class="product-title" onclick="showPageLoader(); window.location.href='product-detail.html?id=${p.id}'">${escapeHtml(p.name)}</div>
                ${p.artist ? `<div class="product-artist">${escapeHtml(p.artist)}</div>` : ''}
                <div class="product-material">${escapeHtml(materialText)}</div>
                ${sizeHtml}
                <div class="product-price" id="bestseller-price-${p.id}">${defaultPrice.toLocaleString()} руб.</div>
                <button class="product-add" onclick="addToCartWithSize('${p.id}')">В корзину</button>
            </div>
        </div>
    `;
    }
    grid.innerHTML = html;
    document.querySelectorAll('.size-select').forEach(select => {
        select.addEventListener('change', function() {
            const pid = this.dataset.product;
            const price = parseInt(this.value);
            document.getElementById(`price-${pid}`).textContent = price.toLocaleString() + ' руб.';
        });
    });
}

function doFilterAndRender() {
    if (productsData.length === 0) {
        if (document.getElementById('catalogGrid')) document.getElementById('catalogGrid').innerHTML = '<div class="loading">Нет товаров</div>';
        updateCatalogCount(0);
        return;
    }
    let filtered = [...productsData];
    if (currentFilter !== 'all') {
        const catMap = { 'painting': 'картины', 'poster': 'постеры', 'modular': 'модульные картины', 'reproduction': 'репродукции' };
        filtered = filtered.filter(p => p.category === catMap[currentFilter]);
    }
    const priceMin = document.getElementById('priceMin') ? parseInt(document.getElementById('priceMin').value) || 0 : 0;
    const priceMax = document.getElementById('priceMax') ? parseInt(document.getElementById('priceMax').value) || 1000000 : 1000000;
    filtered = filtered.filter(p => p.price >= priceMin && p.price <= priceMax);
    const sortBy = document.getElementById('sortSelect')?.value || 'default';
    if (sortBy === 'price-asc') filtered.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price-desc') filtered.sort((a, b) => b.price - a.price);
    else if (sortBy === 'name-asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
    updateCatalogCount(filtered.length);
    const limit = currentPage * itemsPerPage;
    renderCatalog(filtered.slice(0, limit));
    const loadMoreContainer = document.getElementById('loadMoreBtn');
    if (loadMoreContainer) loadMoreContainer.style.display = filtered.length > limit ? 'block' : 'none';
}

function updateCatalogCount(count) {
    const span = document.getElementById('productCount');
    if (span) span.textContent = count;
    const header = document.querySelector('.catalog-header-info');
    if (header) {
        let w = 'товаров';
        if (count % 10 === 1 && count % 100 !== 11) w = 'товар';
        else if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) w = 'товара';
        header.innerHTML = `<span>${count}</span> ${w}`;
    }
}

function applyFiltersAndRender() {
    const grid = document.getElementById('catalogGrid');
    if (grid) grid.innerHTML = '<div class="catalog-loading"><i class="fas fa-spinner fa-pulse"></i> Загрузка...</div>';
    if (filterTimeout) clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => doFilterAndRender(), 300);
}

// ---------- ОТОБРАЖЕНИЕ УСЛУГ ----------
function renderServicesPreview() {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;
    if (servicesData.length === 0) {
        grid.innerHTML = '<div class="catalog-loading"><i class="fas fa-spinner fa-pulse"></i> Загрузка услуг...</div>';
        return;
    }
    const preview = servicesData.slice(0, 4);
    let html = '';
    for (let s of preview) {
        html += `
            <div class="service-card" onclick="showPageLoader(); window.location.href='service-detail.html?id=${s.id}'">
                <div class="service-image"><img src="${s.image}" alt="${escapeHtml(s.name)}"></div>
                <h3>${escapeHtml(s.name)}</h3>
                <p>${escapeHtml(s.description)}</p>
            </div>
        `;
    }
    grid.innerHTML = html;
}

function renderServicesPage() {
    const container = document.getElementById('servicesList');
    if (!container) return;
    if (servicesData.length === 0) {
        container.innerHTML = '<div class="loading">Услуги будут добавлены</div>';
        return;
    }
    let html = '';
    for (let s of servicesData) {
        const featuresHtml = (s.features || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
        html += `
            <div class="service-full-card" onclick="showPageLoader(); window.location.href='service-detail.html?id=${s.id}'">
                <div class="service-image-large">
                    <img src="${s.image || 'https://placehold.co/800x500?text=Услуга'}" alt="${escapeHtml(s.name)}" loading="lazy">
                </div>
                <div class="service-full-card-content">
                    <h2>${escapeHtml(s.name)}</h2>
                    <p>${escapeHtml(s.description)}</p>
                    <ul>${featuresHtml}</ul>
                    <div class="price-info">${escapeHtml(s.price)} &#8381;</div>
                    <button class="service-order-btn" data-service-id="${s.id}" onclick="event.stopPropagation();">
                        ${escapeHtml(s.orderButtonText || 'Заказать')}
                    </button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
    document.querySelectorAll('.service-order-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!currentUser) {
                document.getElementById('authModal')?.classList.add('active');
                document.getElementById('overlay')?.classList.add('active');
                return;
            }
            const service = servicesData.find(s => s.id === btn.dataset.serviceId);
            if (!service) return;
            try {
                await db.collection('service_orders').add({
                    serviceName: service.name,
                    userName: currentUser.displayName || currentUser.email,
                    userEmail: currentUser.email,
                    userId: currentUser.uid,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'новая'
                });
                showNotification('Заявка отправлена! Свяжемся с вами');
            } catch (err) {
                console.error(err);
                showNotification('Ошибка отправки заявки');
            }
        });
    });
}

// ---------- ДЕТАЛЬНАЯ СТРАНИЦА ТОВАРА ----------
function loadProductDetail() {
    const container = document.getElementById('productDetail');
    if (!container) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const product = productsData.find(p => p.id === productId);
    if (!product) {
        window.location.href = 'catalog.html';
        return;
    }
    const isFav = favorites.some(f => f.id === product.id);
    const sizes = getProductSizes(product);
    let sizeHtml = '';
    let defaultPrice = product.price;
    let defaultSizeName = '';
    
    if (sizes.length > 1) {
        const defaultSize = sizes.find(s => s.price === product.price) || sizes[0];
        defaultSizeName = defaultSize.name;
        sizeHtml = `
            <div class="size-selector-container">
                <label>Выберите размер</label>
                <select id="product-size-select" class="product-size-select">
                    ${sizes.map(s => `<option value="${s.price}" data-size-name="${s.name}" ${s.price === product.price ? 'selected' : ''}>${s.name} – ${s.price.toLocaleString()} ₽</option>`).join('')}
                </select>
            </div>
        `;
        defaultPrice = defaultSize.price;
    }
    
    let materialText = product.material;
    if (product.category === 'репродукции' && materialText) {
        materialText = materialText.replace(/\(репродукция\)/gi, '').trim();
    }
    
    const badgeHtml = product.badge && product.badge !== '' 
        ? `<div class="product-badge ${product.badge === 'Новинка' ? 'badge-new' : product.badge === 'Хит' ? 'badge-hit' : 'badge-sale'}">${product.badge}</div>` 
        : '';
    
    let categoryDisplay = '';
    switch(product.category) {
        case 'картины': categoryDisplay = 'КАРТИНА'; break;
        case 'постеры': categoryDisplay = 'ПОСТЕР'; break;
        case 'модульные картины': categoryDisplay = 'МОДУЛЬНАЯ КАРТИНА'; break;
        case 'репродукции': categoryDisplay = 'РЕПРОДУКЦИЯ'; break;
        default: categoryDisplay = product.category.toUpperCase();
    }
    
    // ПРАВИЛЬНЫЙ ПОРЯДОК ЭЛЕМЕНТОВ
    container.innerHTML = `
        <div class="product-detail">
            <div class="product-gallery" style="position: relative;">
                ${badgeHtml}
                <div class="product-main-image">
                    <img src="${product.image}" alt="${escapeHtml(product.name)}">
                </div>
            </div>
            <div class="product-info-detail">
                <div class="product-category">${categoryDisplay}</div>
                <h1>${escapeHtml(product.name)}</h1>
                <div class="product-artist-detail">Художник: ${escapeHtml(product.artist || 'Современный художник')}</div>
                <div class="product-material-detail">${escapeHtml(materialText)}</div>
                ${sizes.length > 1 ? `<div class="product-size-info">${defaultSizeName}</div>` : ''}
                <div class="product-price-detail" id="detail-product-price">${defaultPrice.toLocaleString()} ₽</div>
                <div class="product-description-detail">
                    <p>${escapeHtml(product.description || '')}</p>
                </div>
                ${sizeHtml}
                <div class="product-quantity">
                    <span>Количество:</span>
                    <div class="quantity-selector">
                        <button class="qty-minus" onclick="decrementQty()">-</button>
                        <span id="quantityDisplay">1</span>
                        <button class="qty-plus" onclick="incrementQty()">+</button>
                    </div>
                </div>
                <div class="product-actions-detail">
                    <button class="btn-primary" onclick="addToCartWithQty('${product.id}')"><i class="fas fa-shopping-cart"></i> В корзину</button>
                    <button class="btn-outline favorite-btn" onclick="toggleFavorite('${product.id}')">${isFav ? ' В избранном' : ' В избранное'}</button>
                </div>
            </div>
        </div>
    `;
    
    if (sizes.length > 1) {
        const sizeSelect = document.getElementById('product-size-select');
        if (sizeSelect) {
            sizeSelect.addEventListener('change', function() {
                const newPrice = parseInt(this.value);
                document.getElementById('detail-product-price').textContent = newPrice.toLocaleString() + ' ₽';
                const selectedOption = this.options[this.selectedIndex];
                const sizeName = selectedOption.dataset.sizeName;
                const sizeInfoDiv = document.querySelector('.product-size-info');
                if (sizeInfoDiv) sizeInfoDiv.textContent = sizeName;
            });
        }
    }
    
    window.decrementQty = () => {
        let q = parseInt(document.getElementById('quantityDisplay').textContent);
        if (q > 1) document.getElementById('quantityDisplay').textContent = q - 1;
    };
    
    window.incrementQty = () => {
        let q = parseInt(document.getElementById('quantityDisplay').textContent);
        document.getElementById('quantityDisplay').textContent = q + 1;
    };
    
    window.addToCartWithQty = (pid) => {
        const qty = parseInt(document.getElementById('quantityDisplay').textContent);
        const prod = productsData.find(p => p.id === pid);
        if (!prod) return;
        let selectedPrice = prod.price;
        let selectedSizeName = 'Стандартный размер';
        const sizeSelect = document.getElementById('product-size-select');
        if (sizeSelect && sizeSelect.options.length > 0) {
            selectedPrice = parseInt(sizeSelect.value);
            selectedSizeName = sizeSelect.options[sizeSelect.selectedIndex].dataset.sizeName;
        }
        const existing = cart.find(i => i.id === pid && i.selectedSizeName === selectedSizeName);
        if (existing) existing.quantity = (existing.quantity || 1) + qty;
        else cart.push({ ...prod, price: selectedPrice, quantity: qty, selectedSizeName });
        localStorage.setItem('cart_artgallery', JSON.stringify(cart));
        updateCartCounters();
        renderCart();
        showNotification(`Добавлено в корзину (${selectedSizeName})`, 'success');
    };
    
    loadRelatedProducts(product);
    
    container.style.display = 'block';
    const preloader = document.getElementById('preloader');
    if (preloader) preloader.style.display = 'none';
}
function loadRelatedProducts(currentProduct) {
    const container = document.getElementById('relatedProductsGrid');
    if (!container) return;
    let related = productsData.filter(p => p.category === currentProduct.category && p.id !== currentProduct.id).slice(0, 4);
    if (related.length < 4) related = productsData.filter(p => p.id !== currentProduct.id).slice(0, 4);
    if (related.length === 0) {
        container.innerHTML = '<p>Нет рекомендованных товаров</p>';
        return;
    }
    let html = '';
    for (let p of related) {
        const isFav = favorites.some(f => f.id === p.id);
        html += `
            <div class="product-card">
                <div class="product-image">
                    <img src="${p.image}" alt="${escapeHtml(p.name)}" onclick="showPageLoader(); window.location.href='product-detail.html?id=${p.id}'">
                    <button class="product-fav ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${p.id}')"><i class="${isFav ? 'fas' : 'far'} fa-heart"></i></button>
                </div>
                <div class="product-info">
                    <div class="product-category">${p.category === 'картины' ? 'Картина' : p.category === 'постеры' ? 'Постер' : p.category === 'модульные картины' ? 'Модульная картина' : 'Репродукция'}</div>
                    <div class="product-title" onclick="showPageLoader(); window.location.href='product-detail.html?id=${p.id}'">${escapeHtml(p.name)}</div>
                    <div class="product-price">${p.price.toLocaleString()} руб.</div>
                    <button class="product-add" onclick="addToCart('${p.id}')">В корзину</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

// ---------- ДЕТАЛЬНАЯ СТРАНИЦА УСЛУГИ ----------
function loadServiceDetail() {
    const container = document.getElementById('serviceDetail');
    if (!container) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const serviceId = urlParams.get('id');
    const service = servicesData.find(s => s.id === serviceId);
    if (!service) {
        window.location.href = 'services.html';
        return;
    }
    const featuresHtml = (service.features || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');
    let fullDescription = service.fullDescription || service.description || '';
    fullDescription = fullDescription.replace(/\n/g, '<br>');
    
    container.innerHTML = `
        <div class="service-detail">
            <div class="service-detail-image">
                <img src="${service.image || 'https://placehold.co/800x600?text=Услуга'}" alt="${escapeHtml(service.name)}">
            </div>
            <div class="service-detail-info">
                <h1>${escapeHtml(service.name)}</h1>
                <div class="service-detail-price">${escapeHtml(service.price)}</div>
                <button class="btn-primary service-order-btn-detail" data-service-id="${service.id}">
                    ${escapeHtml(service.orderButtonText || 'Заказать')}
                </button>
                <div class="service-detail-description" style="white-space: pre-wrap; margin-top: 30px;">
                    ${fullDescription}
                </div>
                <div class="service-detail-features">
                    <h3>Преимущества:</h3>
                    <ul>${featuresHtml}</ul>
                </div>
            </div>
        </div>
    `;
    
    document.querySelector('.service-order-btn-detail')?.addEventListener('click', async () => {
        if (!currentUser) {
            document.getElementById('authModal')?.classList.add('active');
            document.getElementById('overlay')?.classList.add('active');
            return;
        }
        try {
            await db.collection('service_orders').add({
                serviceName: service.name,
                userName: currentUser.displayName || currentUser.email,
                userEmail: currentUser.email,
                userId: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'новая'
            });
            showNotification('Заявка отправлена! Свяжемся с вами');
        } catch (err) {
            console.error(err);
            showNotification('Ошибка отправки заявки');
        }
    });
    
    container.style.display = 'block';
    const preloader = document.getElementById('preloader');
    if (preloader) preloader.style.display = 'none';
}

// ---------- ПОИСК ----------
function setupSearch() {
    const searchInput = document.getElementById('headerSearchInput');
    if (!searchInput) return;
    let resultsDiv = document.querySelector('.search-results-header');
    if (!resultsDiv) {
        const wrapper = document.querySelector('.search-wrapper');
        if (wrapper) {
            resultsDiv = document.createElement('div');
            resultsDiv.className = 'search-results-header';
            wrapper.appendChild(resultsDiv);
        }
    }
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = e.target.value.trim().toLowerCase();
            if (!resultsDiv) return;
            if (query.length < 2) {
                resultsDiv.innerHTML = '';
                resultsDiv.style.display = 'none';
                return;
            }
            const productMatches = productsData.filter(p =>
                p.name.toLowerCase().includes(query) ||
                (p.artist && p.artist.toLowerCase().includes(query)) ||
                (p.category && p.category.toLowerCase().includes(query))
            ).slice(0, 6);
            const serviceMatches = servicesData.filter(s =>
                s.name.toLowerCase().includes(query) ||
                (s.description && s.description.toLowerCase().includes(query))
            ).slice(0, 3);
            if (productMatches.length === 0 && serviceMatches.length === 0) {
                resultsDiv.innerHTML = '<div class="search-result-item">Ничего не найдено</div>';
                resultsDiv.style.display = 'block';
                return;
            }
            let html = '';
            if (productMatches.length > 0) {
                html += '<div class="search-category">Товары</div>';
                productMatches.forEach(p => {
                    let catName = '';
                    if (p.category === 'картины') catName = 'Картина';
                    else if (p.category === 'постеры') catName = 'Постер';
                    else if (p.category === 'модульные картины') catName = 'Модульная картина';
                    else catName = 'Репродукция';
                    html += `
                        <div class="search-result-item" data-url="product-detail.html?id=${p.id}">
                            <img class="search-result-img" src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy">
                            <div class="search-result-info">
                                <div class="search-result-name">${escapeHtml(p.name)}</div>
                                <div class="search-result-category">${catName}</div>
                                <div class="search-result-price">${p.price.toLocaleString()} ₽</div>
                            </div>
                        </div>
                    `;
                });
            }
            if (serviceMatches.length > 0) {
                html += '<div class="search-category">Услуги</div>';
                serviceMatches.forEach(s => {
                    html += `
                        <div class="search-result-item" data-url="service-detail.html?id=${s.id}">
                            <div class="search-result-info">
                                <div class="search-result-name">${escapeHtml(s.name)}</div>
                            </div>
                        </div>
                    `;
                });
            }
            resultsDiv.innerHTML = html;
            resultsDiv.style.display = 'block';
            document.querySelectorAll('.search-result-item[data-url]').forEach(el => {
                el.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const url = el.dataset.url;
                    searchInput.value = '';
                    resultsDiv.style.display = 'none';
                    showPageLoader();
                    window.location.href = url;
                });
            });
        }, 300);
    });
    document.addEventListener('click', (e) => {
        if (resultsDiv && !searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });
}

// ---------- АККОРДЕОН ДЛЯ FAQ ----------
function initFaq() {
    const faqItems = document.querySelectorAll('.faq-item');
    if (!faqItems.length) return;
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (!question) return;
        const newQuestion = question.cloneNode(true);
        question.parentNode.replaceChild(newQuestion, question);
        
        newQuestion.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            faqItems.forEach(other => {
                if (other !== item && other.classList.contains('open')) {
                    other.classList.remove('open');
                }
            });
            item.classList.toggle('open');
        });
    });
}

// ---------- АВТОРИЗАЦИЯ ----------
async function registerUser(name, email, password) {
    // Валидация перед отправкой в Firebase
    if (!email || !email.includes('@') || !email.includes('.')) {
        showNotification('Введите корректный email (пример: name@mail.ru)', 'error');
        return { success: false, error: 'invalid_email' };
    }
    if (!password || password.length < 6) {
        showNotification('Пароль должен содержать минимум 6 символов', 'error');
        return { success: false, error: 'weak_password' };
    }
    if (!name || name.trim().length < 2) {
        showNotification('Введите имя (минимум 2 символа)', 'error');
        return { success: false, error: 'invalid_name' };
    }
    
    try {
        // 1. Создаём пользователя в Authentication
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // 2. Сохраняем данные в Firestore (коллекция users)
        await db.collection('users').doc(user.uid).set({
            name: name.trim(),
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            role: 'user'
        });
        
        showNotification('Регистрация успешна! Добро пожаловать!');
        return { success: true, user: user };
        
    } catch (error) {
        console.error('Registration error:', error);
        let message = 'Ошибка регистрации';
        
        // Обработка различных ошибок Firebase
        if (error.code === 'auth/email-already-in-use') {
            message = 'Этот email уже зарегистрирован';
        } else if (error.code === 'auth/invalid-email') {
            message = 'Неверный формат email';
        } else if (error.code === 'auth/weak-password') {
            message = 'Пароль слишком слабый (минимум 6 символов)';
        } else if (error.code === 'permission-denied') {
            message = 'Ошибка прав доступа. Проверьте правила Firebase.';
        }
        
        showNotification(message, 'error');
        return { success: false, error: error.code };
    }
}

async function loginUser(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        if (email === 'laststroke@admin.ru') {
            const adminBtn = document.getElementById('adminBtn');
            if (adminBtn) adminBtn.style.display = 'flex';
        }
        return { success: true, user: userCredential.user };
    } catch (error) {
        showNotification('Неверный email или пароль');
        return { success: false };
    }
}

async function logoutUser() {
    await auth.signOut();
    currentUser = null;
    updateUserUI();
    showNotification('Вы вышли из системы');
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.style.display = 'none';
}

function updateUserUI() {
    const userEmailDisplay = document.getElementById('userEmailDisplay');
    const userInfoHeader = document.getElementById('userInfoHeader');
    const logoutBtnHeader = document.getElementById('logoutBtnHeader');
    const userBtn = document.getElementById('userBtn');
    const adminBtn = document.getElementById('adminBtn');
    if (currentUser) {
        if (userEmailDisplay) userEmailDisplay.textContent = currentUser.email;
        if (userInfoHeader) userInfoHeader.style.display = 'flex';
        if (logoutBtnHeader) logoutBtnHeader.style.display = 'flex';
        if (userBtn) userBtn.style.display = 'none';
        if (adminBtn) adminBtn.style.display = currentUser.email === 'laststroke@admin.ru' ? 'flex' : 'none';
    } else {
        if (userInfoHeader) userInfoHeader.style.display = 'none';
        if (logoutBtnHeader) logoutBtnHeader.style.display = 'none';
        if (userBtn) userBtn.style.display = 'flex';
        if (adminBtn) adminBtn.style.display = 'none';
    }
}

// ---------- ОФОРМЛЕНИЕ ЗАКАЗА ----------
async function saveOrderToFirebase(orderData) {
    console.log('=== НАЧАЛО СОХРАНЕНИЯ ЗАКАЗА ===');
    console.log('currentUser:', currentUser);
    console.log('orderData:', orderData);
    
    if (!currentUser) {
        showNotification('Для оформления заказа необходимо войти в аккаунт', 'error');
        return false;
    }
    
    try {
        // Удаляем поля со значением undefined
        const cleanOrderData = JSON.parse(JSON.stringify(orderData));
        
        // Добавляем служебные поля
        const fullOrderData = {
            ...cleanOrderData,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'новая'
        };
        
        console.log('Отправляем в Firebase:', fullOrderData);
        
        const docRef = await db.collection('orders').add(fullOrderData);
        console.log(' ЗАКАЗ УСПЕШНО СОХРАНЁН! ID:', docRef.id);
        return true;
    } catch (error) {
        console.error(' ОШИБКА ПРИ СОХРАНЕНИИ:', error);
        
        let errorMessage = 'Ошибка сохранения заказа';
        if (error.code === 'permission-denied') {
            errorMessage = 'Нет прав для сохранения заказа. Обновите правила Firebase.';
        } else if (error.code === 'unauthenticated') {
            errorMessage = 'Необходимо войти в аккаунт';
        } else if (error.message && error.message.includes('undefined')) {
            errorMessage = 'Ошибка: незаполненные поля. Заполните все обязательные поля.';
        }
        showNotification(errorMessage, 'error');
        return false;
    }
}

function validatePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 11 || digits.length === 10;
}

function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    let formatted = '';
    if (value.length > 0) {
        formatted = '+7';
        if (value.length > 1) formatted += ' (' + value.slice(1, 4);
        if (value.length >= 5) formatted += ') ' + value.slice(4, 7);
        if (value.length >= 8) formatted += '-' + value.slice(7, 9);
        if (value.length >= 10) formatted += '-' + value.slice(9, 11);
    }
    input.value = formatted;
}

function validateEmail(email) {
    if (!email) return true;
    return /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(email);
}

function validateName(name) {
    return name && name.trim().length >= 2;
}

function validateAddress(address) {
    return address && address.trim().length >= 5;
}

function validateCardNumber(number) {
    return number.replace(/\D/g, '').length === 16;
}

function validateCardExpiry(expiry) {
    const match = expiry.match(/^(\d{2})\/(\d{2})$/);
    if (!match) return false;
    const month = parseInt(match[1], 10);
    const year = parseInt(match[2], 10) + 2000;
    if (month < 1 || month > 12) return false;
    return new Date(year, month, 0) > new Date();
}

function validateCardCvv(cvv) {
    return /^\d{3}$/.test(cvv);
}

function validateCardHolder(holder) {
    return /^[A-Za-zА-Яа-я\s]+$/.test(holder.trim()) && holder.trim().length >= 3;
}

function formatCardNumber(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 16) value = value.slice(0, 16);
    let formatted = '';
    for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += value[i];
    }
    input.value = formatted;
}

function formatCardExpiry(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 4) value = value.slice(0, 4);
    if (value.length >= 3) input.value = value.slice(0, 2) + '/' + value.slice(2);
    else input.value = value;
}

function toggleCardFields() {
    const paymentSelect = document.getElementById('checkoutPayment');
    const cardDetails = document.getElementById('cardDetails');
    if (paymentSelect && cardDetails) {
        cardDetails.style.display = paymentSelect.value === 'card' ? 'block' : 'none';
    }
}

function updatePaymentOptions() {
    const deliverySelect = document.getElementById('checkoutDelivery');
    const paymentSelect = document.getElementById('checkoutPayment');
    if (!deliverySelect || !paymentSelect) return;
    const cashOption = paymentSelect.querySelector('option[value="cash"]');
    if (!cashOption) return;
    cashOption.disabled = false;
    cashOption.style.opacity = '1';
}

function showFieldError(errorId, message, fieldId) {
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
    }
    const field = document.getElementById(fieldId);
    if (field) field.classList.add('error');
}

function updateCheckoutSummary() {
    const container = document.getElementById('checkoutOrderItems');
    const totalSpan = document.getElementById('checkoutTotal');
    if (!container) return;
    const total = cart.reduce((s, i) => s + i.price * (i.quantity || 1), 0);
    let html = '';
    for (let item of cart) {
        const qty = item.quantity || 1;
        html += `<div class="checkout-item"><div class="checkout-item-info"><div class="checkout-item-name">${escapeHtml(item.name)}${item.selectedSizeName ? ' (' + item.selectedSizeName + ')' : ''}</div><div class="checkout-item-quantity">x ${qty}</div></div><div class="checkout-item-price">${(item.price * qty).toLocaleString()} ₽</div></div>`;
    }
    container.innerHTML = html;
    if (totalSpan) totalSpan.textContent = total.toLocaleString() + ' ₽';
}

function clearCheckoutForm() {
    const fields = ['checkoutName', 'checkoutPhone', 'checkoutEmail', 'checkoutAddress', 'cardNumber', 'cardExpiry', 'cardCvv', 'cardHolder'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const selects = ['checkoutDelivery', 'checkoutPayment'];
    selects.forEach(id => { const el = document.getElementById(id); if (el) el.value = 'courier'; });
    const comment = document.getElementById('checkoutComment');
    if (comment) comment.value = '';
    document.querySelectorAll('.error-message').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.form-group input, .form-group select, .form-group textarea').forEach(el => el.classList.remove('error'));
}

function setupInputValidation() {
    const nameInput = document.getElementById('checkoutName');
    const phoneInput = document.getElementById('checkoutPhone');
    const emailInput = document.getElementById('checkoutEmail');
    const addressInput = document.getElementById('checkoutAddress');
    const cardNumber = document.getElementById('cardNumber');
    const cardExpiry = document.getElementById('cardExpiry');
    const cardCvv = document.getElementById('cardCvv');
    const cardHolder = document.getElementById('cardHolder');
    if (nameInput) nameInput.addEventListener('input', function() { this.classList.remove('error'); document.getElementById('nameError')?.classList.remove('show'); });
    if (phoneInput) {
        phoneInput.addEventListener('input', function() { this.classList.remove('error'); document.getElementById('phoneError')?.classList.remove('show'); });
        phoneInput.addEventListener('keyup', function() { formatPhoneNumber(this); });
    }
    if (emailInput) emailInput.addEventListener('input', function() { this.classList.remove('error'); document.getElementById('emailError')?.classList.remove('show'); });
    if (addressInput) addressInput.addEventListener('input', function() { this.classList.remove('error'); document.getElementById('addressError')?.classList.remove('show'); });
    if (cardNumber) cardNumber.addEventListener('input', function() { formatCardNumber(this); this.classList.remove('error'); document.getElementById('cardNumberError')?.classList.remove('show'); });
    if (cardExpiry) cardExpiry.addEventListener('input', function() { formatCardExpiry(this); this.classList.remove('error'); document.getElementById('cardExpiryError')?.classList.remove('show'); });
    if (cardCvv) cardCvv.addEventListener('input', function() { this.classList.remove('error'); document.getElementById('cardCvvError')?.classList.remove('show'); });
    if (cardHolder) cardHolder.addEventListener('input', function() { this.classList.remove('error'); document.getElementById('cardHolderError')?.classList.remove('show'); });
}

// ---------- ЗАКРЫТИЕ ПАНЕЛЕЙ ----------
function closePanels() {
    ['mobileMenu', 'cartPanel', 'favoritesPanel', 'authModal', 'checkoutModal'].forEach(id => {
        const p = document.getElementById(id);
        if (p) p.classList.remove('active');
    });
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.remove('active');
}

function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    const overlay = document.getElementById('overlay');
    if (panel) {
        panel.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active');
    }
}

// ---------- ИНИЦИАЛИЗАЦИЯ ----------
document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('bestsellersGrid')) {
        document.getElementById('bestsellersGrid').innerHTML = '<div class="catalog-loading"><i class="fas fa-spinner fa-pulse"></i> Загрузка товаров...</div>';
    }
    if (document.getElementById('servicesGrid')) {
        document.getElementById('servicesGrid').innerHTML = '<div class="catalog-loading"><i class="fas fa-spinner fa-pulse"></i> Загрузка услуг...</div>';
    }
    
    await loadProductsFromFirebase();
    await loadServicesFromFirebase();
    renderBestsellers();
    renderServicesPreview();
    renderCart();
    renderFavorites();
    updateCartCounters();
    setupSearch();
    initFaq();
    setupInputValidation();
    toggleCardFields();
    updatePaymentOptions();
    
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    if (categoryParam && document.getElementById('categoryIcons')) {
        const catMap = { 'painting': 'painting', 'poster': 'poster', 'modular': 'modular', 'reproduction': 'reproduction' };
        if (catMap[categoryParam]) {
            currentFilter = catMap[categoryParam];
            const targetBtn = document.querySelector(`.category-icon-btn[data-filter="${catMap[categoryParam]}"]`);
            if (targetBtn) {
                document.querySelectorAll('.category-icon-btn').forEach(btn => btn.classList.remove('active'));
                targetBtn.classList.add('active');
            }
        }
    }
    
    if (document.getElementById('categoryIcons')) {
        const categoryBtns = document.querySelectorAll('.category-icon-btn');
        categoryBtns.forEach(btn => btn.addEventListener('click', function() {
            categoryBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            currentPage = 1;
            applyFiltersAndRender();
        }));
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) sortSelect.addEventListener('change', () => { currentPage = 1; applyFiltersAndRender(); });
        const priceMin = document.getElementById('priceMin');
        const priceMax = document.getElementById('priceMax');
        if (priceMin) priceMin.addEventListener('input', () => { currentPage = 1; applyFiltersAndRender(); });
        if (priceMax) priceMax.addEventListener('input', () => { currentPage = 1; applyFiltersAndRender(); });
        const filterReset = document.getElementById('filterReset');
        if (filterReset) {
            filterReset.addEventListener('click', () => {
                categoryBtns.forEach(b => b.classList.remove('active'));
                document.querySelector('.category-icon-btn[data-filter="all"]')?.classList.add('active');
                if (priceMin) priceMin.value = 0;
                if (priceMax) priceMax.value = 1000000;
                if (sortSelect) sortSelect.value = 'default';
                currentFilter = 'all';
                currentPage = 1;
                applyFiltersAndRender();
            });
        }
        const loadMoreBtn = document.querySelector('#loadMoreBtn button');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                currentPage++;
                const originalText = loadMoreBtn.innerHTML;
                loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Загрузка...';
                loadMoreBtn.disabled = true;
                setTimeout(() => {
                    doFilterAndRender();
                    loadMoreBtn.innerHTML = originalText;
                    loadMoreBtn.disabled = false;
                }, 300);
            });
        }
        doFilterAndRender();
    }
    
    if (document.getElementById('productDetail')) loadProductDetail();
    if (document.getElementById('serviceDetail')) loadServiceDetail();
    if (document.getElementById('servicesList')) renderServicesPage();
    
    document.getElementById('userBtn')?.addEventListener('click', () => {
        document.getElementById('authModal')?.classList.add('active');
        document.getElementById('overlay')?.classList.add('active');
    });
    document.querySelector('.auth-modal-close')?.addEventListener('click', closePanels);
    document.getElementById('overlay')?.addEventListener('click', closePanels);
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            document.getElementById(tabId + 'Form').classList.add('active');
        });
    });
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const result = await loginUser(email, password);
        if (result.success) {
            currentUser = result.user;
            updateUserUI();
            closePanels();
            showNotification('Добро пожаловать!');
        }
    });
    document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    
    // Проверка email
    if (!email || !email.includes('@') || !email.includes('.')) {
        showNotification('Введите корректный email (пример: name@mail.ru)', 'error');
        return;
    }
    // Проверка пароля
    if (!password || password.length < 6) {
        showNotification('Пароль должен содержать минимум 6 символов', 'error');
        return;
    }
    // Проверка имени
    if (!name || name.length < 2) {
        showNotification('Введите имя (минимум 2 символа)', 'error');
        return;
    }
    
    const result = await registerUser(name, email, password);
    if (result.success) {
        currentUser = result.user;
        updateUserUI();
        closePanels();
        // Очищаем поля формы
        document.getElementById('registerName').value = '';
        document.getElementById('registerEmail').value = '';
        document.getElementById('registerPassword').value = '';
    }
    });
    document.getElementById('cartBtn')?.addEventListener('click', () => togglePanel('cartPanel'));
    document.querySelector('.cart-close')?.addEventListener('click', closePanels);
    document.getElementById('favoritesBtn')?.addEventListener('click', () => togglePanel('favoritesPanel'));
    document.querySelector('.favorites-close')?.addEventListener('click', closePanels);
    document.getElementById('menuBtn')?.addEventListener('click', () => togglePanel('mobileMenu'));
    document.querySelector('.mobile-menu-close')?.addEventListener('click', closePanels);
    document.getElementById('logoutBtnHeader')?.addEventListener('click', () => logoutUser());
    
    document.getElementById('checkoutBtn')?.addEventListener('click', () => {
        if (cart.length === 0) { showNotification('Корзина пуста'); return; }
        if (!currentUser) {
            document.getElementById('authModal')?.classList.add('active');
            document.getElementById('overlay')?.classList.add('active');
            return;
        }
        clearCheckoutForm();
        updateCheckoutSummary();
        document.getElementById('checkoutModal')?.classList.add('active');
        document.getElementById('overlay')?.classList.add('active');
    });
    document.querySelector('.checkout-modal-close')?.addEventListener('click', closePanels);
    document.getElementById('checkoutDelivery')?.addEventListener('change', function() {
        updatePaymentOptions();
        if (this.value === 'pickup') {
            document.getElementById('checkoutAddress').value = 'Самовывоз (Москва, ул. Тверская, 15)';
        } else if (this.value === 'courier' && document.getElementById('checkoutAddress').value === 'Самовывоз (Москва, ул. Тверская, 15)') {
            document.getElementById('checkoutAddress').value = '';
        }
    });
    document.getElementById('checkoutPayment')?.addEventListener('change', toggleCardFields);
    updatePaymentOptions();
    
    document.getElementById('checkoutForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('checkoutName').value;
        const phone = document.getElementById('checkoutPhone').value;
        const email = document.getElementById('checkoutEmail')?.value || '';
        const address = document.getElementById('checkoutAddress').value;
        const deliveryMethod = document.getElementById('checkoutDelivery').value;
        const paymentMethod = document.getElementById('checkoutPayment').value;
        let isValid = true;
        
        // ===== ПРИНУДИТЕЛЬНАЯ ПРОВЕРКА ПОЛЕЙ КАРТЫ 
        const cardNumberField = document.getElementById('cardNumber');
        const cardExpiryField = document.getElementById('cardExpiry');
        const cardCvvField = document.getElementById('cardCvv');
        const cardHolderField = document.getElementById('cardHolder');
        const cardDetails = document.getElementById('cardDetails');
        const isCardVisible = cardDetails && cardDetails.style.display !== 'none';
        
        if (cardNumberField && cardExpiryField && cardCvvField && cardHolderField && isCardVisible) {
            const cardNumberValue = cardNumberField.value.replace(/\s/g, '');
            const cardExpiryValue = cardExpiryField.value;
            const cardCvvValue = cardCvvField.value;
            const cardHolderValue = cardHolderField.value.trim();
            
            if (!cardNumberValue.match(/^\d{16}$/)) {
                showFieldError('cardNumberError', 'Введите 16 цифр номера карты', 'cardNumber');
                isValid = false;
            }
            if (!cardExpiryValue.match(/^(0[1-9]|1[0-2])\/\d{2}$/)) {
                showFieldError('cardExpiryError', 'Введите срок в формате ММ/ГГ', 'cardExpiry');
                isValid = false;
            }
            if (!cardCvvValue.match(/^\d{3}$/)) {
                showFieldError('cardCvvError', 'Введите 3 цифры CVV', 'cardCvv');
                isValid = false;
            }
            if (!validateCardHolder(cardHolderValue)) {
                showFieldError('cardHolderError', 'Введите имя владельца карты (только буквы, не менее 3 символов)', 'cardHolder');
                isValid = false;
            }
        }
        
        // Стандартные проверки
        if (!validateName(name)) { showFieldError('nameError', 'Введите имя (минимум 2 символа)', 'checkoutName'); isValid = false; }
        if (!validatePhone(phone)) { showFieldError('phoneError', 'Введите корректный номер телефона', 'checkoutPhone'); isValid = false; }
        if (email && !validateEmail(email)) { showFieldError('emailError', 'Введите корректный email', 'checkoutEmail'); isValid = false; }
        if (deliveryMethod === 'courier' && !validateAddress(address)) { showFieldError('addressError', 'Введите адрес доставки', 'checkoutAddress'); isValid = false; }
        
        if (!isValid) { showNotification('Пожалуйста, заполните все поля правильно', 'error'); return; }
        
        const cleanPhone = phone.replace(/\D/g, '');
        // Создаём заказ, исключая undefined поля
        const orderData = {
            customerName: name.trim() || 'Не указано',
            customerPhone: cleanPhone || 'Не указан',
            delivery: deliveryMethod,
            payment: paymentMethod,
            items: cart.map(i => ({ 
                id: i.id, 
                name: i.name || 'Без названия', 
                price: i.price || 0, 
                quantity: i.quantity || 1, 
                size: i.selectedSizeName || 'Стандартный' 
            })),
            totalAmount: cart.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
        };

        // Добавляем только если есть значение
        if (email && email.trim()) orderData.customerEmail = email.trim();
        if (address && address.trim()) orderData.customerAddress = address.trim();
        if (document.getElementById('checkoutComment')?.value) {
            orderData.comment = document.getElementById('checkoutComment').value;
        }
        if (paymentMethod === 'card') {
            orderData.cardLast4 = document.getElementById('cardNumber').value.replace(/\D/g, '').slice(-4);
            orderData.cardHolder = document.getElementById('cardHolder').value;
        }
        const success = await saveOrderToFirebase(orderData);
        if (success) {
            cart = [];
            localStorage.setItem('cart_artgallery', JSON.stringify(cart));
            updateCartCounters();
            renderCart();
            closePanels();
            clearCheckoutForm();
            showNotification('Заказ оформлен! Спасибо за покупку!');
        }
    });
    
    document.getElementById('adminBtn')?.addEventListener('click', () => {
        if (currentUser && currentUser.email === 'laststroke@admin.ru') window.location.href = 'admin.html';
        else showNotification('Доступ только для администратора');
    });
    
    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', function() {
            window.location.href = `catalog.html?category=${this.dataset.category}`;
        });
    });
    
    auth.onAuthStateChanged(user => {
        currentUser = user;
        updateUserUI();
    });
// ФИКС ВЫРАВНИВАНИЯ И ПЕРЕКРЫТИЯ
setTimeout(function() {
    const container = document.querySelector('.product-detail');
    if (container) {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = '1fr 1fr';
        container.style.alignItems = 'flex-start';
        container.style.gap = '60px';
    }
    
    const qtyBlock = document.querySelector('.product-quantity');
    const sizeBlock = document.querySelector('.size-selector-container');
    
    if (qtyBlock && sizeBlock) {
        qtyBlock.style.marginTop = '30px';
        qtyBlock.style.display = 'block';
        qtyBlock.style.clear = 'both';
    }
}, 100);
});
