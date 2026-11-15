/**
 * CASHIER DESK PORTAL SCRIPT
 */
const currentUser = JSON.parse(localStorage.getItem('arenax_user'));
if (!currentUser || currentUser.role !== 'cashier') {
    window.location.href = '/index.html';
}

let walkinSelectedSeats = [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('branch-badge').textContent = currentUser.location;
    document.getElementById('branch-title').textContent = currentUser.location;
    document.getElementById('walkin-branch').textContent = currentUser.location;
    document.getElementById('cashier-name').textContent = currentUser.name;

    loadBranchBookings();
    loadWalkinSeats();
});

function logout() {
    localStorage.removeItem('arenax_user');
    window.location.href = '/index.html';
}

function switchTab(tabId, btn) {
    document.getElementById('bookings-tab').classList.add('hidden');
    document.getElementById('walkin-tab').classList.add('hidden');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(tabId).classList.remove('hidden');
    btn.classList.add('active');
}

async function loadBranchBookings() {
    const res = await fetch(`/api/staff/bookings?role=cashier&location=${encodeURIComponent(currentUser.location)}`);
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('cashier-bookings-body');
    tbody.innerHTML = '';

    data.bookings.forEach(b => {
        const msLeft = b.endTime - Date.now();
        const timeText = (b.status === 'ACTIVE' && msLeft > 0)
            ? `${Math.ceil(msLeft / 60000)} mins left`
            : b.status;

        let refundBtn = '-';
        if (b.refundRequested) {
            refundBtn = `<button type="button" onclick="approveRefund('${b.id}')" class="btn-secondary btn-sm">Approve Refund (${b.refundHours}h / ${b.refundAmount.toLocaleString()} FRW)</button>`;
        } else if (b.status === 'REFUNDED') {
            refundBtn = `<span class="success-text">Approved</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${b.id}</strong></td>
            <td>${b.userName}</td>
            <td>${b.bookingType}</td>
            <td>${b.seats.join(', ')}</td>
            <td>${b.hours} hr(s)</td>
            <td>${b.totalAmount.toLocaleString()} FRW</td>
            <td><span class="badge">${b.status}</span></td>
            <td>${timeText}</td>
            <td>${refundBtn}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function approveRefund(bookingId) {
    const res = await fetch('/api/cashier/approve-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, cashierLocation: currentUser.location })
    });
    const data = await res.json();
    alert(data.message);
    loadBranchBookings();
    loadWalkinSeats();
}

function toggleWalkinTime() {
    const type = document.getElementById('walkin-type').value;
    document.getElementById('walkin-time-box').classList.toggle('hidden', type !== 'RESERVE');
    loadWalkinSeats();
}

async function loadWalkinSeats() {
    walkinSelectedSeats = [];
    document.getElementById('walkin-selected-text').textContent = 'None';

    const type = document.getElementById('walkin-type').value;
    const startTime = document.getElementById('walkin-time').value;
    const hours = document.getElementById('walkin-hours').value;

    const query = new URLSearchParams({ location: currentUser.location, type, startTime, hours });
    const res = await fetch(`/api/seats?${query.toString()}`);
    const data = await res.json();

    ['PC', 'PS5', 'VIP'].forEach(sec => {
        const box = document.getElementById(`walkin-${sec}`);
        box.innerHTML = '';
        data.seatStatus[sec].forEach(seat => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `${sec}-${seat.number}`;
            btn.className = `seat-btn ${seat.available ? 'available' : 'occupied'}`;
            btn.disabled = !seat.available;
            if (seat.available) {
                btn.onclick = () => {
                    const idx = walkinSelectedSeats.indexOf(seat.seatId);
                    if (idx > -1) {
                        walkinSelectedSeats.splice(idx, 1);
                        btn.classList.remove('selected');
                    } else {
                        walkinSelectedSeats.push(seat.seatId);
                        btn.classList.add('selected');
                    }
                    document.getElementById('walkin-selected-text').textContent = walkinSelectedSeats.join(', ') || 'None';
                };
            }
            box.appendChild(btn);
        });
    });
}

async function submitWalkinBooking() {
    const clientName = document.getElementById('walkin-client-name').value.trim();
    const bookingType = document.getElementById('walkin-type').value;
    const reserveTime = document.getElementById('walkin-time').value;
    const hours = document.getElementById('walkin-hours').value;

    if (!clientName || walkinSelectedSeats.length === 0) {
        alert("Enter client name and select at least one seat.");
        return;
    }

    const createRes = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: currentUser.id,
            userName: `${clientName} (Walk-in)`,
            location: currentUser.location,
            bookingType,
            seats: walkinSelectedSeats,
            hours,
            reserveTime
        })
    });
    const created = await createRes.json();
    if (!created.success) return alert(created.message);

    await fetch('/api/bookings/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: created.booking.id })
    });

    alert(`Walk-in booking confirmed! Total collected: ${created.booking.totalAmount.toLocaleString()} FRW`);
    document.getElementById('walkin-client-name').value = '';
    loadWalkinSeats();
    loadBranchBookings();
}
