/**
 * CLIENT BOOKING & LIVE TIMER SCRIPT
 * Auto-loads the location chosen on the landing page, allows switching branches anytime,
 * handles 1-minute payment hold countdown, MoMo USSD code copy, live session timers, and whole-hour refunds.
 */

const RATES = { PC: 5000, PS5: 2000, VIP: 10000 };
let selectedSeats = [];
let activeBookingForPayment = null;
let holdTimerInterval = null;
let clientBookingsCache = [];

const currentUser = JSON.parse(localStorage.getItem('arenax_user'));
if (!currentUser) {
    window.location.href = '/index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('user-greeting').textContent = `Welcome, ${currentUser.name}`;

    // Pre-select branch chosen on the landing page
    const preferredLoc = localStorage.getItem('arenax_preferred_location');
    const locSelect = document.getElementById('location-select');
    if (preferredLoc && locSelect) {
        locSelect.value = preferredLoc;
    }

    loadSeats();
    loadMyBookings();

    setInterval(updateLiveCountdowns, 1000);
});

function onLocationChange() {
    const loc = document.getElementById('location-select').value;
    localStorage.setItem('arenax_preferred_location', loc);
    loadSeats();
}

function logout() {
    localStorage.removeItem('arenax_user');
    window.location.href = '/index.html';
}

function toggleReserveTime() {
    const type = document.getElementById('booking-type').value;
    const box = document.getElementById('reserve-time-box');
    box.classList.toggle('hidden', type !== 'RESERVE');
    loadSeats();
}

async function loadSeats() {
    selectedSeats = [];
    updateSummary();

    const location = document.getElementById('location-select').value;
    const type = document.getElementById('booking-type').value;
    const startTime = document.getElementById('reserve-time').value;
    const hours = document.getElementById('hours-select').value;

    const query = new URLSearchParams({ location, type, startTime, hours });
    const res = await fetch(`/api/seats?${query.toString()}`);
    const data = await res.json();

    if (!data.success) return;

    ['PC', 'PS5', 'VIP'].forEach(sec => {
        const container = document.getElementById(`seats-${sec}`);
        container.innerHTML = '';

        data.seatStatus[sec].forEach(seat => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `${sec}-${seat.number}`;
            btn.className = `seat-btn ${seat.available ? 'available' : 'occupied'}`;
            btn.disabled = !seat.available;

            if (seat.available) {
                btn.onclick = () => toggleSeat(seat.seatId, btn);
            }
            container.appendChild(btn);
        });
    });
}

function toggleSeat(seatId, btnElement) {
    const index = selectedSeats.indexOf(seatId);
    if (index > -1) {
        selectedSeats.splice(index, 1);
        btnElement.classList.remove('selected');
    } else {
        selectedSeats.push(seatId);
        btnElement.classList.add('selected');
    }
    updateSummary();
}

function updateSummary() {
    const hours = parseInt(document.getElementById('hours-select').value) || 1;
    let hourlySum = 0;
    selectedSeats.forEach(id => {
        const sec = id.split('-')[0];
        hourlySum += RATES[sec] || 0;
    });

    const total = hourlySum * hours;
    document.getElementById('selected-seats-text').textContent = selectedSeats.length ? selectedSeats.join(', ') : 'None';
    document.getElementById('total-price-text').textContent = `${total.toLocaleString()} FRW`;
}

async function proceedToPayment() {
    if (selectedSeats.length === 0) {
        alert("Please select at least one seat first.");
        return;
    }

    const location = document.getElementById('location-select').value;
    const bookingType = document.getElementById('booking-type').value;
    const hours = document.getElementById('hours-select').value;
    const reserveTime = document.getElementById('reserve-time').value;

    if (bookingType === 'RESERVE' && !reserveTime) {
        alert("Please pick your preferred arrival date and time for your reservation.");
        return;
    }

    const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: currentUser.id,
            userName: currentUser.name,
            location,
            bookingType,
            seats: selectedSeats,
            hours,
            reserveTime
        })
    });

    const data = await res.json();
    if (!data.success) {
        alert(data.message);
        loadSeats();
        return;
    }

    activeBookingForPayment = data.booking;
    openPaymentModal(data.booking);
    loadSeats();
}

function openPaymentModal(booking) {
    document.getElementById('pay-booking-id').textContent = booking.id;
    document.getElementById('pay-location').textContent = booking.location;
    document.getElementById('pay-seats').textContent = booking.seats.join(', ');
    document.getElementById('pay-amount').textContent = `${booking.totalAmount.toLocaleString()} FRW`;
    document.getElementById('copy-feedback').textContent = '';
    document.getElementById('payment-modal').classList.remove('hidden');

    clearInterval(holdTimerInterval);
    holdTimerInterval = setInterval(() => {
        const msLeft = booking.holdExpiresAt - Date.now();
        if (msLeft <= 0) {
            clearInterval(holdTimerInterval);
            document.getElementById('hold-countdown').textContent = "00:00 (EXPIRED)";
            alert("1-minute payment hold expired! Your seats were released.");
            closePaymentModal();
            loadSeats();
            return;
        }
        const secs = Math.ceil(msLeft / 1000);
        document.getElementById('hold-countdown').textContent = `00:${secs < 10 ? '0' : ''}${secs}`;
    }, 500);
}

function closePaymentModal() {
    clearInterval(holdTimerInterval);
    document.getElementById('payment-modal').classList.add('hidden');
}

function copyMomoCode() {
    const code = document.getElementById('momo-code-text').textContent;
    navigator.clipboard.writeText(code).then(() => {
        document.getElementById('copy-feedback').textContent = `Copied ${code} to clipboard!`;
    });
}

async function confirmPayment() {
    if (!activeBookingForPayment) return;

    const res = await fetch('/api/bookings/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: activeBookingForPayment.id })
    });
    const data = await res.json();

    if (data.success) {
        closePaymentModal();
        alert(data.message);
        loadSeats();
        loadMyBookings();
    } else {
        alert(data.message);
        closePaymentModal();
    }
}

async function loadMyBookings() {
    const res = await fetch(`/api/bookings/my?userId=${encodeURIComponent(currentUser.id)}`);
    const data = await res.json();
    if (!data.success) return;

    clientBookingsCache = data.bookings;
    const tbody = document.getElementById('my-bookings-body');
    tbody.innerHTML = '';

    data.bookings.forEach(b => {
        const tr = document.createElement('tr');
        let refundHtml = '-';

        if (b.refundRequested) {
            refundHtml = `<span class="badge">Pending Cashier (${b.refundHours}h)</span>`;
        } else if (b.status === 'REFUNDED') {
            refundHtml = `<span class="success-text">Refunded (${b.refundAmount.toLocaleString()} FRW)</span>`;
        } else if (b.status === 'ACTIVE' || b.status === 'RESERVED') {
            refundHtml = `<button type="button" onclick="requestRefund('${b.id}')" class="btn-danger btn-sm">Refund</button>`;
        }

        tr.innerHTML = `
            <td><strong>${b.id}</strong></td>
            <td>${b.location}</td>
            <td>${b.bookingType}</td>
            <td>${b.seats.join(', ')}</td>
            <td>${b.totalAmount.toLocaleString()} FRW</td>
            <td><span class="badge">${b.status}</span></td>
            <td id="timer-${b.id}" class="highlight">--:--:--</td>
            <td>${refundHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    updateLiveCountdowns();
}

function updateLiveCountdowns() {
    const now = Date.now();
    clientBookingsCache.forEach(b => {
        const cell = document.getElementById(`timer-${b.id}`);
        if (!cell) return;

        if (b.status === 'ACTIVE') {
            const diff = b.endTime - now;
            cell.textContent = diff > 0 ? formatDuration(diff) : "Completed";
        } else if (b.status === 'RESERVED') {
            if (now < b.startTime) {
                cell.textContent = `Starts in ${formatDuration(b.startTime - now)}`;
            } else if (now < b.endTime) {
                cell.textContent = formatDuration(b.endTime - now);
            } else {
                cell.textContent = "Completed";
            }
        } else {
            cell.textContent = b.status;
        }
    });
}

function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function requestRefund(bookingId) {
    if (!confirm("Request a refund? Note: Refunds only apply to remaining WHOLE hours and require Cashier approval.")) {
        return;
    }

    const res = await fetch('/api/bookings/request-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId })
    });
    const data = await res.json();
    alert(data.message);
    loadMyBookings();
}
