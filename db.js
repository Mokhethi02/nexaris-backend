// db.js - MySQL Connection for Nexaris
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // your MySQL username
    password: '', // your MySQL password (leave empty if none)
    database: 'nexaris',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to MySQL database');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

// User functions
async function createUser(email, passwordHash, fullName) {
    const [result] = await pool.execute(
        'INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)',
        [email, passwordHash, fullName]
    );
    return result.insertId;
}

async function getUserByEmail(email) {
    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE email = ?',
        [email]
    );
    return rows[0];
}

async function getUserById(id) {
    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE id = ?',
        [id]
    );
    return rows[0];
}

// Wallet functions
async function saveWallet(userId, walletData) {
    const [result] = await pool.execute(
        `INSERT INTO wallets 
         (user_id, wallet_name, address, encrypted_private_key, public_key, mnemonic_phrase, is_default) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, walletData.name, walletData.address, walletData.encryptedKey, 
         walletData.publicKey, walletData.mnemonic, walletData.isDefault || false]
    );
    return result.insertId;
}

async function getUserWallets(userId) {
    const [rows] = await pool.execute(
        'SELECT * FROM wallets WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
        [userId]
    );
    return rows;
}

// Transaction functions
async function saveTransaction(txData) {
    const [result] = await pool.execute(
        `INSERT INTO transactions 
         (tx_hash, user_id, wallet_id, from_address, to_address, amount, asset_id, fee, status, type, timestamp) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [txData.tx_hash, txData.user_id, txData.wallet_id, txData.from, txData.to, 
         txData.amount, txData.asset_id, txData.fee, txData.status, txData.type, txData.timestamp]
    );
    return result.insertId;
}

async function getUserTransactions(userId, limit = 50) {
    const [rows] = await pool.execute(
        `SELECT t.*, a.symbol, a.name as asset_name 
         FROM transactions t
         JOIN assets a ON t.asset_id = a.id
         WHERE t.user_id = ?
         ORDER BY t.timestamp DESC
         LIMIT ?`,
        [userId, limit]
    );
    return rows;
}

module.exports = {
    testConnection,
    createUser,
    getUserByEmail,
    getUserById,
    saveWallet,
    getUserWallets,
    saveTransaction,
    getUserTransactions,
    pool
};