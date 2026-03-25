// db.js - Database connection for Nexaris
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
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

// ==================== USER FUNCTIONS ====================
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

// ==================== BLOCKCHAIN PERSISTENCE ====================
async function saveBlock(block) {
    const [result] = await pool.execute(
        `INSERT INTO blocks (block_index, block_hash, previous_hash, timestamp, nonce, difficulty, miner_address, tx_count, size, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         block_hash = VALUES(block_hash),
         previous_hash = VALUES(previous_hash),
         timestamp = VALUES(timestamp),
         nonce = VALUES(nonce),
         difficulty = VALUES(difficulty),
         miner_address = VALUES(miner_address),
         tx_count = VALUES(tx_count),
         size = VALUES(size),
         version = VALUES(version)`,
        [
            block.index,
            block.hash,
            block.previousHash,
            block.timestamp,
            block.nonce,
            block.difficulty,
            block.miner || null,
            block.transactions.length,
            block.size,
            block.version
        ]
    );
    return result.insertId;
}

async function loadBlocks() {
    const [rows] = await pool.execute(
        `SELECT * FROM blocks ORDER BY block_index ASC`
    );
    return rows;
}

async function saveTransaction(tx, blockIndex) {
    const [result] = await pool.execute(
        `INSERT INTO chain_transactions (tx_hash, from_address, to_address, amount, fee, timestamp, block_index, data, signature, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         block_index = VALUES(block_index)`,
        [
            tx.id,
            tx.from || null,
            tx.to,
            tx.amount,
            tx.fee || 0.0001,
            tx.timestamp,
            blockIndex,
            tx.data || '',
            tx.signature || '',
            tx.version || '1.0.0'
        ]
    );
    return result.insertId;
}

async function loadTransactions(blockIndex = null) {
    let sql = `SELECT * FROM chain_transactions`;
    const params = [];
    if (blockIndex !== null) {
        sql += ` WHERE block_index = ?`;
        params.push(blockIndex);
    }
    sql += ` ORDER BY timestamp ASC`;
    const [rows] = await pool.execute(sql, params);
    return rows;
}

async function loadAllTransactions() {
    const [rows] = await pool.execute(
        `SELECT * FROM chain_transactions ORDER BY timestamp ASC`
    );
    return rows;
}

// ==================== EXPORTS ====================
module.exports = {
    testConnection,
    createUser,
    getUserByEmail,
    getUserById,
    saveBlock,
    loadBlocks,
    saveTransaction,
    loadTransactions,
    loadAllTransactions,
    pool
};