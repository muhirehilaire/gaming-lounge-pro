/**
 * ADMIN / COMPANY OWNER SCRIPT
 */
const currentUser = JSON.parse(localStorage.getItem('arenax_user'));
if (!currentUser || currentUser.role !== 'admin') {
    window.location.href = '/index.html';
}

let allBookingsCache = [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('admin-name').textContent = currentUser.name;
    loadAdminData();
});

function logout() {
    localStorage.removeItem('arenax_user');
    window.location.href = '/index.html';
}

async function loadAdminData() {
    const resAnalytics = await fetch('/api/admin/analytics');
    const analytics = await resAnalytics.json();

    if (analytics.success) {
        document.getElementById('kpi-gross').textContent = `${analytics.summary.totalGrossIncome.toLocaleString()} FRW`;
        document.getElementById('kpi-refunds').textContent = `${analytics.summary.totalRefunded.toLocaleString()} FRW`;
        document.getElementById('kpi-net').textContent = `${analytics.summary.netIncome.toLocaleString()} FRW`;
        document.getElementById('kpi-bookings').textContent = analytics.summary.totalBookings;

        const locBody = document.getElementById('location-analytics-body');
        locBody.innerHTML = '';
        for (const [loc, stats] of Object.entries(analytics.incomeByLocation)) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${loc}</strong></td>
                <td>${stats.bookings}</td>
                <td>${stats.gross.toLocaleString()} FRW</td>
                <td class="danger-text">${stats.refunded.toLocaleString()} FRW</td>
                <td class="highlight">${stats.net.toLocaleString()} FRW</td>
            `;
            locBody.appendChild(tr);
        }

        const cashierBody = document.getElementById('cashiers-list-body');
        cashierBody.innerHTML = '';
        analytics.cashiers.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c.name}</td><td>${c.email}</td><td><span class="badge">${c.location}</span></td><td>${c.phone || '-'}</td>`;
            cashierBody.appendChild(tr);
        });
    }

    const resBookings = await fetch('/api/staff/bookings?role=admin');
    const bookingsData = await resBookings.json();
    if (bookingsData.success) {
        allBookingsCache = bookingsData.bookings;
        renderMasterBookings();
    }
}

function renderMasterBookings() {
    const filter = document.getElementById('admin-filter-loc').value;
    const tbody = document.getElementById('admin-bookings-body');
    tbody.innerHTML = '';

    const filtered = filter === 'ALL'
        ? allBookingsCache
        : allBookingsCache.filter(b => b.location === filter);

    filtered.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${b.id}</strong></td>
            <td>${b.location}</td>
            <td>${b.userName}</td>
            <td>${b.bookingType}</td>
            <td>${b.seats.join(', ')}</td>
            <td>${b.totalAmount.toLocaleString()} FRW</td>
            <td><span class="badge">${b.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('register-cashier-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('c-name').value.trim();
    const email = document.getElementById('c-email').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    const location = document.getElementById('c-location').value;
    const password = document.getElementById('c-password').value;

    const res = await fetch('/api/admin/register-cashier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: currentUser.id, name, email, phone, location, password })
    });
    const data = await res.json();

    const msg = document.getElementById('cashier-msg');
    msg.textContent = data.message;
    msg.style.color = data.success ? '#10b981' : '#f87171';
    msg.classList.remove('hidden');

    if (data.success) {
        document.getElementById('register-cashier-form').reset();
        loadAdminData();
    }
});
