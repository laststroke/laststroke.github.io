// cart.js - Управление корзиной и избранным

let cart = JSON.parse(localStorage.getItem('cart')) || [];
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];

function updateCounters() {
    const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
    const favCount = favorites.length;
    const cartEl = document.getElementById('cartCount');
    const favEl = document.getElementById('favoritesCount');
    if (cartEl) cartEl.textContent = cartCount;
    if (favEl) favEl.textContent = favCount;
}

function renderCart() {
    const container = document.getElementById('cartItems');
    const totalSpan = document.getElementById('cartTotal');
    if (!container) return;
    
    if (cart.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;">Корзина пуста</div>';
        if (totalSpan) totalSpan.textContent = '0 ₽';
        return;
    }
    
    let total = 0;
    container.innerHTML = cart.map((item, index) => {
        total += item.price * item.quantity;
        return `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-price">${item.price.toLocaleString()} ₽</div>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateQuantity('${item.id}', ${item.quantity - 1})">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateQuantity('${item.id}', ${item.quantity + 1})">+</button>
                    </div>
                </div>
                <button class="quantity-btn" onclick="removeFromCart('${item.id}')" style="background:transparent;">✕</button>
            </div>
        `;
    }).join('');
    
    if (totalSpan) totalSpan.textContent = `${total.toLocaleString()} ₽`;
}

function renderFavorites() {
    const container = document.getElementById('favoritesItems');
    if (!container) return;
    
    if (favorites.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;">Избранное пусто</div>';
        return;
    }
    
    container.innerHTML = favorites.map(item => `
        <div class="cart-item">
            <img src="${item.image}" alt="${item.name}">
            <div class="cart-item-info">
                <div class="cart-item-title">${item.name}</div>
                <div class="cart-item-price">${item.price.toLocaleString()} ₽</div>
                <button class="btn-outline" style="padding:6px 12px;margin-top:8px;" onclick="addToCart('${item.id}')">В корзину</button>
            </div>
            <button class="quantity-btn" onclick="toggleFavorite('${item.id}')" style="background:transparent;">✕</button>
        </div>
    `).join('');
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        const existing = cart.find(i => i.id === productId);
        if (existing) {
            existing.quantity++;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCounters();
        renderCart();
        showNotification('Добавлено в корзину');
    }
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.id !== productId);
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCounters();
    renderCart();
    showNotification('Удалено из корзины');
}

function updateQuantity(productId, newQuantity) {
    if (newQuantity < 1) {
        // При количестве 1 и нажатии "-" товар не удаляется, а остается с количеством 1
        // Поэтому ничего не делаем при newQuantity === 0
        if (newQuantity === 0) return;
        removeFromCart(productId);
        return;
    }
    const item = cart.find(i => i.id === productId);
    if (item) {
        item.quantity = newQuantity;
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCounters();
        renderCart();
    }
}

function toggleFavorite(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        const index = favorites.findIndex(f => f.id === productId);
        if (index === -1) {
            favorites.push(product);
            showNotification('Добавлено в избранное');
        } else {
            favorites.splice(index, 1);
            showNotification('Удалено из избранного');
        }
        localStorage.setItem('favorites', JSON.stringify(favorites));
        updateCounters();
        renderFavorites();
        
        // Обновляем кнопки избранного на странице
        document.querySelectorAll(`.product-fav[onclick*="toggleFavorite('${productId}')"]`).forEach(btn => {
            const isFav = favorites.some(f => f.id === productId);
            btn.classList.toggle('active', isFav);
            btn.textContent = isFav ? '★' : '☆';
        });
        
        const favDetailBtn = document.querySelector(`.favorite-detail-btn[onclick*="toggleFavorite('${productId}')"]`);
        if (favDetailBtn) {
            const isFav = favorites.some(f => f.id === productId);
            favDetailBtn.textContent = isFav ? '★ В избранном' : '☆ В избранное';
            favDetailBtn.classList.toggle('active', isFav);
        }
    }
}

function showNotification(message) {
    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}