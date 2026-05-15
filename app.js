// 1. DATABASE CONFIGURATION (IndexedDB using Vanilla Wrapper)
const DB_NAME = "SmartShopDB";
let db;

const initDB = () => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        db = e.target.result;
        db.createObjectStore("products", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("customers", { keyPath: "phone" });
        db.createObjectStore("sales", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        loadInventory();
        updateDashboard();
    };
};

// 2. STATE MANAGEMENT
let cart = [];
let html5QrCode;

// 3. AI VOICE PROCESSING (Speech to Data)
const startVoiceAI = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech Recognition not supported");

    const recognition = new SpeechRecognition();
    recognition.lang = 'hi-IN'; // Supports Hindi + English
    
    document.getElementById('ai-overlay').classList.remove('hidden');
    recognition.start();

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        document.getElementById('ai-transcript').innerText = transcript;
        processAICommand(transcript);
        setTimeout(() => stopVoiceAI(), 2000);
    };
};

const stopVoiceAI = () => {
    document.getElementById('ai-overlay').classList.add('hidden');
};

const processAICommand = (text) => {
    // Regex for parsing: "2 kg rice", "500 gram sugar", "Rahim ko..."
    const qtyMatch = text.match(/(\d+)\s*(kg|gram|g|ml|litre|pcs|pc|pen|notebook)/i);
    const itemMatch = text.replace(/(\d+)\s*(kg|gram|g|ml|litre|pcs|pc|add|do|karo)/gi, '').trim();

    if (qtyMatch && itemMatch) {
        const qty = parseFloat(qtyMatch[1]);
        const unit = qtyMatch[2];
        
        // Find product in DB
        const transaction = db.transaction(["products"], "readonly");
        const store = transaction.objectStore("products");
        store.getAll().onsuccess = (e) => {
            const products = e.target.result;
            const product = products.find(p => itemMatch.includes(p.name.toLowerCase()));
            
            if (product) {
                addToCart(product, qty, unit);
            } else {
                alert(`Product "${itemMatch}" not found in inventory.`);
            }
        };
    }
    
    // Customer Name detection "Rahim ko..."
    if (text.includes("ko")) {
        const name = text.split("ko")[0].trim();
        document.getElementById('cust-name').value = name;
    }
};

// 4. BILLING LOGIC
const addToCart = (product, qty, unit) => {
    let finalPrice = product.price;
    
    // Weight Calculation (Smart Conversion)
    if (unit === 'gram' || unit === 'g') {
        finalPrice = (product.price * qty) / 1000;
    } else if (unit === 'ml') {
        finalPrice = (product.price * qty) / 1000;
    } else {
        finalPrice = product.price * qty;
    }

    cart.push({ ...product, qty, unit, total: finalPrice });
    renderCart();
};

const renderCart = () => {
    const tbody = document.getElementById('cart-items');
    tbody.innerHTML = cart.map((item, index) => `
        <tr class="border-b border-white/5">
            <td class="py-4">${item.name}</td>
            <td class="text-center">${item.qty} ${item.unit}</td>
            <td class="text-right">₹${item.price}</td>
            <td class="text-right font-bold">₹${item.total.toFixed(2)}</td>
        </tr>
    `).join('');
    
    const grandTotal = cart.reduce((sum, item) => sum + item.total, 0);
    document.getElementById('bill-total').innerText = `₹${grandTotal.toFixed(2)}`;
    document.getElementById('bill-subtotal').innerText = `₹${grandTotal.toFixed(2)}`;
};

// 5. BARCODE SCANNER
const toggleScanner = () => {
    const readerDiv = document.getElementById('reader');
    if (html5QrCode) {
        html5QrCode.stop();
        html5QrCode = null;
        readerDiv.classList.add('hidden');
    } else {
        readerDiv.classList.remove('hidden');
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: 250 },
            (decodedText) => {
                findAndAddByBarcode(decodedText);
                toggleScanner();
            }
        );
    }
};

const findAndAddByBarcode = (code) => {
    const store = db.transaction("products").objectStore("products");
    store.getAll().onsuccess = (e) => {
        const p = e.target.result.find(item => item.barcode === code);
        if (p) addToCart(p, 1, p.unit);
    };
};

// 6. UTILITIES
const showSection = (id) => {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
};

const toggleModal = (id) => document.getElementById(id).classList.toggle('hidden');

const saveProduct = () => {
    const p = {
        name: document.getElementById('p-name').value,
        barcode: document.getElementById('p-barcode').value,
        price: parseFloat(document.getElementById('p-price').value),
        unit: document.getElementById('p-unit').value,
        stock: 100
    };
    const tx = db.transaction("products", "readwrite");
    tx.objectStore("products").add(p);
    tx.oncomplete = () => {
        toggleModal('product-modal');
        loadInventory();
    };
};

const loadInventory = () => {
    const store = db.transaction("products").objectStore("products");
    store.getAll().onsuccess = (e) => {
        const list = document.getElementById('inventory-list');
        list.innerHTML = e.target.result.map(p => `
            <div class="glass-card p-4 flex justify-between items-center">
                <div>
                    <h4 class="font-bold">${p.name}</h4>
                    <p class="text-sm text-slate-400">₹${p.price}/${p.unit}</p>
                </div>
                <div class="text-emerald-400 font-mono text-xs">${p.barcode}</div>
            </div>
        `).join('');
    };
};

const finalizeBill = () => {
    const customer = document.getElementById('cust-name').value || "Cash Customer";
    const total = document.getElementById('bill-total').innerText;
    const msg = `*Thank you for shopping at SmartShop!*%0A%0A*Customer:* ${customer}%0A*Total:* ${total}%0AItems: ${cart.map(i => i.name).join(', ')}`;
    window.open(`https://wa.me/?text=${msg}`, '_blank');
    
    // Save transaction
    const tx = db.transaction("sales", "readwrite");
    tx.objectStore("sales").add({ customer, total, items: cart, date: new Date() });
    cart = [];
    renderCart();
};

initDB();
