/**
 * AUTHENTICATION, QR LANDING & LOCATION SELECTOR SCRIPT
 * Manages Sign-Up, Login, Forgot Password views, clickable location buttons, and live QR generation.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Generate live QR code pointing to this website URL
    const currentUrl = window.location.origin;
    const qrImg = document.getElementById('qr-image');
    if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(currentUrl)}`;
    }

    // 2. Restore previously chosen location if any
    const savedLoc = localStorage.getItem('arenax_preferred_location') || 'NYAMIRAMBO';
    setPreferredLocation(savedLoc);

    // 3. Make all 8 branch buttons clickable so client can pick location on the go
    document.querySelectorAll('.branch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const loc = btn.getAttribute('data-loc');
            setPreferredLocation(loc);
            showMessage(`Branch set to ${loc}. Sign up or log in to book seats at ${loc}!`);
        });
    });

    // 4. Bind form switch buttons cleanly
    document.getElementById('to-login-btn').addEventListener('click', () => showForm('login'));
    document.getElementById('to-forgot-btn').addEventListener('click', () => showForm('forgot'));
    document.getElementById('to-signup-btn').addEventListener('click', () => showForm('signup'));
    document.getElementById('back-login-btn').addEventListener('click', () => showForm('login'));
});

function setPreferredLocation(loc) {
    localStorage.setItem('arenax_preferred_location', loc);
    const label = document.getElementById('selected-branch-label');
    if (label) label.textContent = loc;

    document.querySelectorAll('.branch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-loc') === loc);
    });
}

function showForm(formName) {
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('auth-message').classList.add('hidden');

    document.getElementById(`${formName}-form`).classList.remove('hidden');
}

function showMessage(text, isError = false) {
    const box = document.getElementById('auth-message');
    box.textContent = text;
    box.style.color = isError ? '#f87171' : '#10b981';
    box.classList.remove('hidden');
}

// 1. Handle Client Sign-Up -> Automatically lands on Login Form upon success
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    btn.textContent = "Registering...";

    try {
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const password = document.getElementById('reg-password').value;

        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password })
        });
        const data = await res.json();

        if (data.success) {
            showForm('login');
            document.getElementById('login-email').value = email;
            showMessage("Registration complete! Please log in with your credentials.");
        } else {
            showMessage(data.message || "Registration failed.", true);
        }
    } catch (err) {
        showMessage("Cannot reach server. Make sure 'npm start' is running in gaming-lounge-pro.", true);
    } finally {
        btn.disabled = false;
        btn.textContent = "Register Account";
    }
});

// 2. Handle Login -> Redirects Admin, Cashier, or Client to their portal
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = "Logging in...";

    try {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem('arenax_user', JSON.stringify(data.user));
            if (data.user.role === 'admin') {
                window.location.href = '/admin.html';
            } else if (data.user.role === 'cashier') {
                window.location.href = '/cashier.html';
            } else {
                window.location.href = '/booking.html';
            }
        } else {
            showMessage(data.message || "Invalid credentials.", true);
        }
    } catch (err) {
        showMessage("Cannot reach server. Make sure 'npm start' is running in gaming-lounge-pro.", true);
    } finally {
        btn.disabled = false;
        btn.textContent = "Login to Dashboard";
    }
});

// 3. Handle Forgot Password
document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const email = document.getElementById('forgot-email').value.trim();
        const newPassword = document.getElementById('forgot-password').value;

        const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, newPassword })
        });
        const data = await res.json();

        if (data.success) {
            showForm('login');
            document.getElementById('login-email').value = email;
            showMessage(data.message);
        } else {
            showMessage(data.message, true);
        }
    } catch (err) {
        showMessage("Server error. Please check your Node.js terminal.", true);
    }
});
