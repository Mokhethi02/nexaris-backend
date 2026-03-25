// server.js - Nexaris Backend API with MySQL persistence
const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const db = require('./db');
const Blockchain = require('../blockchain-core/blockchain/blockchain');
const Block = require('../blockchain-core/blockchain/block');
const { Transaction } = require('../blockchain-core/blockchain/transaction');

const app = express();
app.use(cors());
app.use(express.json());

// Global blockchain instance (loaded from DB)
let nexaris = null;

// ============================================
// 1. Load blockchain from MySQL on startup
// ============================================
async function loadBlockchainFromDB() {
    const storedBlocks = await db.loadBlocks();
    const storedTxs = await db.loadAllTransactions();

    if (storedBlocks.length === 0) {
        // No blockchain stored – start fresh
        nexaris = new Blockchain();
        console.log('Started new blockchain (genesis block)');
        // Save genesis block to DB immediately
        await db.saveBlock(nexaris.chain[0]);
        for (const tx of nexaris.chain[0].transactions) {
            await db.saveTransaction(tx, 0);
        }
        console.log('Saved genesis block to database');
    } else {
        // Rebuild blockchain from stored data
        nexaris = new Blockchain();
        // Clear default chain (we'll rebuild)
        nexaris.chain = [];

        for (const blockRow of storedBlocks) {
            // Get transactions for this block
            const blockTxs = storedTxs.filter(tx => tx.block_index === blockRow.block_index);
            const txObjects = blockTxs.map(tx => new Transaction(
                tx.from_address,
                tx.to_address,
                parseFloat(tx.amount),
                parseFloat(tx.fee),
                tx.data
            ));
            // Reconstruct block
            const block = new Block(
                blockRow.block_index,
                blockRow.timestamp,
                txObjects,
                blockRow.previous_hash,
                blockRow.nonce,
                blockRow.miner_address
            );
            block.hash = blockRow.block_hash;
            block.size = blockRow.size;
            block.version = blockRow.version;
            // Add to chain
            nexaris.chain.push(block);
        }
        // Rebuild internal state (UTXO set, total supply)
        for (const block of nexaris.chain) {
            nexaris.updateUTXOSet(block);
            for (const tx of block.transactions) {
                if (tx.isCoinbase && tx.isCoinbase()) {
                    nexaris.totalSupply += tx.amount;
                }
            }
        }
        console.log(`Loaded ${nexaris.chain.length} blocks from database`);
    }
}

// Intercept addBlock to persist to DB
const originalAddBlock = Blockchain.prototype.addBlock;
Blockchain.prototype.addBlock = function(block) {
    const result = originalAddBlock.call(this, block);
    // After adding to chain, save to DB
    db.saveBlock(block).catch(err => console.error('Error saving block:', err));
    for (const tx of block.transactions) {
        db.saveTransaction(tx, block.index).catch(err => console.error('Error saving transaction:', err));
    }
    console.log(`✅ Saved block #${block.index} to database`);
    return result;
};

// ============================================
// 2. Start server after blockchain is loaded
// ============================================
loadBlockchainFromDB().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`✅ Nexaris backend running on port ${PORT}`);
        console.log(`   Blockchain height: ${nexaris.chain.length}`);
    });
}).catch(err => {
    console.error('Failed to initialize blockchain:', err);
    process.exit(1);
});

// ============================================
// 3. Helper to get current blockchain instance
// ============================================
function getBlockchain() {
    if (!nexaris) throw new Error('Blockchain not initialized');
    return nexaris;
}

// ============================================
// 4. API Endpoints (all use `nexaris`)
// ============================================

// Test route
app.get('/api/test', (req, res) => {
    res.json({ message: 'Nexaris API is running!', status: 'online', blocks: nexaris.chain.length });
});

// Register new user
app.post('/api/register', async (req, res) => {
    try {
        const { email, password, fullName } = req.body;
        if (!email || !password || !fullName) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = await db.createUser(email, hashedPassword, fullName);
        res.json({ success: true, userId, message: 'Registration successful' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(400).json({ error: 'Invalid password' });
        }
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get balance for an address
app.get('/api/balance/:address', async (req, res) => {
    try {
        const address = req.params.address;
        const balance = nexaris.getBalance(address);
        res.json({ address, balance });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get transactions for an address
app.get('/api/transactions/:address', async (req, res) => {
    try {
        const address = req.params.address;
        const transactions = [];
        for (const block of nexaris.chain) {
            for (const tx of block.transactions) {
                if (tx.from === address || tx.to === address) {
                    transactions.push({
                        id: tx.id,
                        from: tx.from,
                        to: tx.to,
                        amount: tx.amount,
                        fee: tx.fee || 0.001,
                        timestamp: block.timestamp,
                        blockIndex: block.index,
                        type: tx.from === address ? 'send' : 'receive'
                    });
                }
            }
        }
        res.json({ address, transactions: transactions.reverse() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send NXS transaction
app.post('/api/send', async (req, res) => {
    try {
        const { fromAddress, toAddress, amount, privateKey } = req.body;
        if (!fromAddress || !toAddress || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const balance = nexaris.getBalance(fromAddress);
        if (balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        const tx = new Transaction(fromAddress, toAddress, amount);
        if (privateKey) {
            tx.sign(privateKey);
        }
        nexaris.addToMempool(tx);
        res.json({
            success: true,
            txId: tx.id,
            message: 'Transaction added to mempool'
        });
    } catch (error) {
        console.error('Send error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get blockchain info
app.get('/api/blockchain/info', (req, res) => {
    try {
        res.json(nexaris.getChainInfo());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get recent blocks
app.get('/api/blocks', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const blocks = nexaris.chain.slice(-limit).map(block => ({
            index: block.index,
            hash: block.hash,
            previousHash: block.previousHash,
            timestamp: block.timestamp,
            transactions: block.transactions.length,
            miner: block.miner || 'Network'
        }));
        res.json({ blocks, total: nexaris.chain.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get block by height
app.get('/api/block/:height', (req, res) => {
    try {
        const height = parseInt(req.params.height);
        const block = nexaris.chain.find(b => b.index === height);
        if (!block) {
            return res.status(404).json({ error: 'Block not found' });
        }
        res.json(block);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get transaction by ID
app.get('/api/tx/:txId', (req, res) => {
    try {
        const txId = req.params.txId;
        for (const block of nexaris.chain) {
            const tx = block.transactions.find(t => t.id === txId);
            if (tx) {
                res.json({ transaction: tx, blockIndex: block.index, blockHash: block.hash });
                return;
            }
        }
        res.status(404).json({ error: 'Transaction not found' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get mempool
app.get('/api/mempool', (req, res) => {
    try {
        res.json({
            count: nexaris.mempool.length,
            transactions: nexaris.mempool.map(tx => ({
                id: tx.id,
                from: tx.from,
                to: tx.to,
                amount: tx.amount,
                fee: tx.fee
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get network status
app.get('/api/network/status', (req, res) => {
    try {
        res.json({
            blockHeight: nexaris.chain.length,
            difficulty: nexaris.difficulty,
            miningReward: nexaris.miningReward,
            mempoolSize: nexaris.mempool.length,
            totalSupply: nexaris.totalSupply,
            version: nexaris.version,
            networkId: nexaris.networkId
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// (Optional) Temporary endpoint to add test funds – remove in production
app.post('/api/addFunds', async (req, res) => {
    try {
        const { address, amount } = req.body;
        if (!address || !amount) {
            return res.status(400).json({ error: 'Missing address or amount' });
        }
        const tx = new Transaction('coinbase', address, amount);
        nexaris.addToMempool(tx);
        // Mine a block immediately (simulate)
        const latestBlock = nexaris.getLatestBlock();
        const newBlock = new Block(
            latestBlock.index + 1,
            Date.now(),
            [tx],
            latestBlock.hash,
            0,
            'miner'
        );
        // Mine quickly (just set difficulty to 1 for test)
        const origDiff = nexaris.difficulty;
        nexaris.difficulty = 1;
        newBlock.mineBlock(1);
        nexaris.addBlock(newBlock);
        nexaris.difficulty = origDiff;
        res.json({ success: true, message: `Added ${amount} NXS to ${address}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});