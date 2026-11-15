/**
 * GAMING LOUNGE PRO - BACKEND SERVER (Pure Node.js & Express)
 * Handles authentication, multi-location seat inventory, 1-minute hold timers,
 * BOOK vs RESERVE logic, MoMo payment confirmation, Cashier approval, Refunds, and Admin Analytics.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'database.json');

// Middleware to parse JSON requests and serve static frontend files from /public
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------
// CONSTANTS & CONFIGURATION
// ---------------------------------------------------------
const LOCATIONS = [
    "NYAMIRAMBO", "NYAMATA", "NYARUTARAMA", "KIMIRONKO",
    "REMERA", "KICUKIRO", "MUSANZE", "KAYONZA"
];

const SECTIONS = {
    PC:  { label: "PC Gaming", count: 10, rate: 5000 },
    PS5: { label: "PS5 Arena", count: 10, rate: 2000 },
    VIP: { label: "VIP Lounge", count: 4, rate: 10000 }
};

// ---------------------------------------------------------
// DATABASE INITIALIZATION & PERSISTENCE (JSON File)
// ---------------------------------------------------------
function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: [
                {
                    id: "usr-admin-1",
                    name: "Company Owner (Admin)",
                    email: "admin@gaminglounge.rw",
                    phone: "0788000001",
                    password: "admin123",
                    role: "admin",
                    location: "ALL"
                },
                {
                    id: "usr-cashier-1",
                    name: "Cashier Nyamirambo",
                    email: "nyamirambo@gaminglounge.rw",
                    phone: "0788000002",
                    password: "cashier123",
                    role: "cashier",
                    location: "NYAMIRAMBO"
                },
                {
                    id: "usr-cashier-2",
                    name: "Cashier Kimironko",
                    email: "kimironko@gaminglounge.rw",
                    phone: "0788000003",
                    password: "cashier123",
                    role: "cashier",
                    location: "KIMIRONKO"
                }
            ],
            bookings: []
        };
        saveDatabase(initialData);
        return initialData;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDatabase(data) {
    // Automatically create the 'data' folder if it doesn't exist
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Helper: Clean up expired 1-minute payment holds automatically
function cleanupExpiredHolds(db) {
    const now = Date.now();
    let changed = false;
    db.bookings.forEach(b => {
        if (b.status === "HOLD" && now > b.holdExpiresAt) {
            b.status = "EXPIRED";
            changed = true;
        }
    });
    if (changed) saveDatabase(db);
}

// ---------------------------------------------------------
// AUTHENTICATION ROUTES
// ---------------------------------------------------------

// Register a new client account
app.post('/api/auth/register', (req, res) => {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    }

    const db = loadDatabase();
    if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Email is already registered." });
    }

    const newUser = {
        id: "usr-" + Date.now(),
        name,
        email,
        phone: phone || "",
        password,
        role: "client",
        location: null
    };

    db.users.push(newUser);
    saveDatabase(db);

    res.json({ success: true, message: "Registration successful! Please log in." });
});

// Login for Admin, Cashier, or Client
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const db = loadDatabase();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

    if (!user) {
        return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const { password: _, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

// Forgot Password reset
app.post('/api/auth/forgot-password', (req, res) => {
    const { email, newPassword } = req.body;
    const db = loadDatabase();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
        return res.status(404).json({ success: false, message: "No account found with that email." });
    }
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ success: false, message: "Please provide a new password (min 4 chars)." });
    }

    user.password = newPassword;
    saveDatabase(db);
    res.json({ success: true, message: "Password updated! You can now log in." });
});

// Admin registers a new Cashier assigned to a specific location
app.post('/api/admin/register-cashier', (req, res) => {
    const { adminId, name, email, phone, password, location } = req.body;
    const db = loadDatabase();

    const admin = db.users.find(u => u.id === adminId && u.role === "admin");
    if (!admin) {
        return res.status(403).json({ success: false, message: "Unauthorized. Admin privileges required." });
    }
    if (!name || !email || !password || !LOCATIONS.includes(location)) {
        return res.status(400).json({ success: false, message: "All fields and a valid location are required." });
    }
    if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Email already exists." });
    }

    const newCashier = {
        id: "usr-cashier-" + Date.now(),
        name,
        email,
        phone: phone || "",
        password,
        role: "cashier",
        location
    };

    db.users.push(newCashier);
    saveDatabase(db);

    res.json({ success: true, message: `Cashier ${name} registered for ${location}.` });
});

// ---------------------------------------------------------
// SEAT AVAILABILITY & BOOKING ROUTES
// ---------------------------------------------------------

app.get('/api/config', (req, res) => {
    res.json({ success: true, locations: LOCATIONS, sections: SECTIONS, momoCode: "*182*8*1*1074944#" });
});

app.get('/api/seats', (req, res) => {
    const { location, type, startTime, hours } = req.query;
    if (!LOCATIONS.includes(location)) {
        return res.status(400).json({ success: false, message: "Invalid location." });
    }

    const db = loadDatabase();
    cleanupExpiredHolds(db);

    const reqStart = type === "RESERVE" && startTime ? new Date(startTime).getTime() : Date.now();
    const reqHours = parseInt(hours) || 1;
    const reqEnd = reqStart + reqHours * 3600 * 1000;

    const seatStatus = {};
    for (const [secKey, secInfo] of Object.entries(SECTIONS)) {
        seatStatus[secKey] = [];
        for (let num = 1; num <= secInfo.count; num++) {
            const seatId = `${secKey}-${num}`;
            const conflict = db.bookings.find(b => {
                if (b.location !== location) return false;
                if (!b.seats.includes(seatId)) return false;
                if (!["HOLD", "PENDING_APPROVAL", "ACTIVE", "RESERVED"].includes(b.status)) return false;
                return (reqStart < b.endTime && reqEnd > b.startTime);
            });

            seatStatus[secKey].push({
                seatId,
                number: num,
                available: !conflict,
                status: conflict ? conflict.status : "AVAILABLE"
            });
        }
    }

    res.json({ success: true, seatStatus });
});

app.post('/api/bookings/create', (req, res) => {
    const { userId, userName, location, bookingType, seats, hours, reserveTime } = req.body;

    if (!userId || !LOCATIONS.includes(location) || !Array.isArray(seats) || seats.length === 0) {
        return res.status(400).json({ success: false, message: "Missing booking details or no seats selected." });
    }

    const db = loadDatabase();
    cleanupExpiredHolds(db);

    const durHours = Math.max(1, parseInt(hours) || 1);
    const startTime = bookingType === "RESERVE" && reserveTime ? new Date(reserveTime).getTime() : Date.now();
    const endTime = startTime + durHours * 3600 * 1000;

    if (bookingType === "RESERVE" && startTime < Date.now() - 60000) {
        return res.status(400).json({ success: false, message: "Reservation time must be in the future." });
    }

    for (const seatId of seats) {
        const conflict = db.bookings.find(b =>
            b.location === location &&
            b.seats.includes(seatId) &&
            ["HOLD", "PENDING_APPROVAL", "ACTIVE", "RESERVED"].includes(b.status) &&
            (startTime < b.endTime && endTime > b.startTime)
        );
        if (conflict) {
            return res.status(409).json({ success: false, message: `Seat ${seatId} is no longer available.` });
        }
    }

    let hourlyTotal = 0;
    seats.forEach(seatId => {
        const secKey = seatId.split('-')[0];
        if (SECTIONS[secKey]) hourlyTotal += SECTIONS[secKey].rate;
    });
    const totalAmount = hourlyTotal * durHours;
    const holdExpiresAt = Date.now() + 60 * 1000;

    const newBooking = {
        id: "BK-" + Math.floor(100000 + Math.random() * 900000),
        userId,
        userName: userName || "Client",
        location,
        bookingType,
        seats,
        hours: durHours,
        hourlyRate: hourlyTotal,
        totalAmount,
        startTime,
        endTime,
        holdExpiresAt,
        status: "HOLD",
        refundRequested: false,
        refundHours: 0,
        refundAmount: 0,
        createdAt: Date.now()
    };

    db.bookings.push(newBooking);
    saveDatabase(db);

    res.json({ success: true, booking: newBooking });
});

app.post('/api/bookings/confirm-payment', (req, res) => {
    const { bookingId } = req.body;
    const db = loadDatabase();
    cleanupExpiredHolds(db);

    const booking = db.bookings.find(b => b.id === bookingId);
    if (!booking) {
        return res.status(404).json({ success: false, message: "Booking not found." });
    }
    if (booking.status === "EXPIRED") {
        return res.status(400).json({ success: false, message: "1-minute hold expired! Please select seats again." });
    }

    if (booking.bookingType === "BOOK") {
        booking.startTime = Date.now();
        booking.endTime = booking.startTime + booking.hours * 3600 * 1000;
        booking.status = "ACTIVE";
    } else {
        booking.status = "RESERVED";
    }

    saveDatabase(db);
    res.json({ success: true, message: "Payment confirmed! Your session is active.", booking });
});

app.post('/api/bookings/request-refund', (req, res) => {
    const { bookingId } = req.body;
    const db = loadDatabase();
    const booking = db.bookings.find(b => b.id === bookingId);

    if (!booking || !["ACTIVE", "RESERVED"].includes(booking.status)) {
        return res.status(400).json({ success: false, message: "Only active or reserved bookings can be refunded." });
    }

    const now = Date.now();
    const remainingMs = booking.status === "RESERVED" && now < booking.startTime
        ? (booking.endTime - booking.startTime)
        : (booking.endTime - now);

    const wholeHoursLeft = Math.floor(remainingMs / (3600 * 1000));
    if (wholeHoursLeft < 1) {
        return res.status(400).json({
            success: false,
            message: "Refund denied: Less than 1 full hour remaining. Refunds apply to whole hours only."
        });
    }

    booking.refundRequested = true;
    booking.refundHours = wholeHoursLeft;
    booking.refundAmount = wholeHoursLeft * booking.hourlyRate;
    saveDatabase(db);

    res.json({
        success: true,
        message: `Refund request for ${wholeHoursLeft} whole hour(s) (${booking.refundAmount.toLocaleString()} FRW) sent to Cashier for approval.`
    });
});

app.get('/api/bookings/my', (req, res) => {
    const { userId } = req.query;
    const db = loadDatabase();
    cleanupExpiredHolds(db);

    let updated = false;
    db.bookings.forEach(b => {
        if ((b.status === "ACTIVE" || b.status === "RESERVED") && Date.now() >= b.endTime) {
            b.status = "COMPLETED";
            updated = true;
        }
    });
    if (updated) saveDatabase(db);

    const myBookings = db.bookings
        .filter(b => b.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt);

    res.json({ success: true, bookings: myBookings });
});

// ---------------------------------------------------------
// CASHIER & ADMIN DASHBOARD ROUTES
// ---------------------------------------------------------

app.get('/api/staff/bookings', (req, res) => {
    const { role, location } = req.query;
    const db = loadDatabase();
    cleanupExpiredHolds(db);

    let list = db.bookings;
    if (role === "cashier") {
        list = list.filter(b => b.location === location);
    }

    res.json({
        success: true,
        bookings: list.sort((a, b) => b.createdAt - a.createdAt)
    });
});

app.post('/api/cashier/approve-refund', (req, res) => {
    const { bookingId, cashierLocation } = req.body;
    const db = loadDatabase();
    const booking = db.bookings.find(b => b.id === bookingId);

    if (!booking || !booking.refundRequested) {
        return res.status(404).json({ success: false, message: "Refund request not found." });
    }
    if (cashierLocation && booking.location !== cashierLocation) {
        return res.status(403).json({ success: false, message: "You can only approve refunds for your own branch." });
    }

    booking.status = "REFUNDED";
    booking.refundRequested = false;
    booking.endTime = Date.now();
    saveDatabase(db);

    res.json({
        success: true,
        message: `Refund of ${booking.refundAmount.toLocaleString()} FRW approved and seats released.`
    });
});

app.get('/api/admin/analytics', (req, res) => {
    const db = loadDatabase();
    cleanupExpiredHolds(db);

    const paidStatuses = ["ACTIVE", "RESERVED", "COMPLETED", "REFUNDED"];
    let totalGrossIncome = 0;
    let totalRefunded = 0;
    const incomeByLocation = {};
    LOCATIONS.forEach(loc => incomeByLocation[loc] = { gross: 0, refunded: 0, net: 0, bookings: 0 });

    db.bookings.forEach(b => {
        if (paidStatuses.includes(b.status)) {
            totalGrossIncome += b.totalAmount;
            if (incomeByLocation[b.location]) {
                incomeByLocation[b.location].gross += b.totalAmount;
                incomeByLocation[b.location].bookings += 1;
            }
            if (b.status === "REFUNDED") {
                totalRefunded += b.refundAmount;
                if (incomeByLocation[b.location]) {
                    incomeByLocation[b.location].refunded += b.refundAmount;
                }
            }
        }
    });

    LOCATIONS.forEach(loc => {
        incomeByLocation[loc].net = incomeByLocation[loc].gross - incomeByLocation[loc].refunded;
    });

    const cashiers = db.users
        .filter(u => u.role === "cashier")
        .map(({ password, ...rest }) => rest);

    res.json({
        success: true,
        summary: {
            totalGrossIncome,
            totalRefunded,
            netIncome: totalGrossIncome - totalRefunded,
            totalBookings: db.bookings.filter(b => paidStatuses.includes(b.status)).length
        },
        incomeByLocation,
        cashiers
    });
});



if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

// Export the Express API for Vercel serverless functions
module.exports = app;
