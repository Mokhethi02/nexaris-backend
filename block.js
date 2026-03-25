/**
 * Nexaris Blockchain Core
 * block.js - Block Structure & Validation
 * 
 * Author: Moeti Solomon Mokhethi
 * Copyright © 2026 Nexaris Foundation
 * Version: 1.0.0
 * License: MIT
 */

const crypto = require('crypto');
const { Transaction } = require('./transaction');

class Block {
    /**
     * Create a new block
     * @param {number} index - Block height
     * @param {number} timestamp - Block creation time
     * @param {Array} transactions - List of transactions
     * @param {string} previousHash - Hash of previous block
     * @param {number} nonce - Proof of work nonce
     * @param {string} miner - Address of mining reward recipient
     */
    constructor(index, timestamp, transactions, previousHash = '', nonce = 0, miner = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.nonce = nonce;
        this.miner = miner;
        this.merkleRoot = this.calculateMerkleRoot();
        this.hash = this.calculateHash();
        this.size = JSON.stringify(this).length;
        this.version = '1.0.0';
    }

    /**
     * Calculate block hash using double SHA-256
     * @returns {string} Block hash
     */
    calculateHash() {
        const blockData = 
            this.index +
            this.previousHash +
            this.timestamp +
            this.merkleRoot +
            this.nonce +
            this.miner +
            this.version;

        return crypto
            .createHash('sha256')
            .update(blockData)
            .digest('hex');
    }

    /**
     * Calculate Merkle root from transactions
     * @returns {string} Merkle root hash
     */
    calculateMerkleRoot() {
        if (!this.transactions || this.transactions.length === 0) {
            return crypto.createHash('sha256').update('empty').digest('hex');
        }

        // Get transaction hashes
        const txHashes = this.transactions.map(tx => 
            typeof tx === 'string' ? tx : tx.hash || tx.calculateHash()
        );

        // Build Merkle tree
        let merkle = txHashes;
        
        while (merkle.length > 1) {
            const temp = [];
            
            for (let i = 0; i < merkle.length; i += 2) {
                if (i + 1 < merkle.length) {
                    // Combine two hashes
                    const combined = merkle[i] + merkle[i + 1];
                    temp.push(
                        crypto
                            .createHash('sha256')
                            .update(combined)
                            .digest('hex')
                    );
                } else {
                    // Odd number of hashes - duplicate last one
                    temp.push(merkle[i]);
                }
            }
            
            merkle = temp;
        }

        return merkle[0];
    }

    /**
     * Mine block with Proof of Work
     * @param {number} difficulty - Current network difficulty
     * @returns {Block} Mined block
     */
    mineBlock(difficulty) {
        const target = '0'.repeat(difficulty);
        const startTime = Date.now();
        
        console.log(`⛏️  Mining block #${this.index}...`);
        
        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = this.calculateHash();
        }

        const miningTime = (Date.now() - startTime) / 1000;
        const hashRate = Math.round(this.nonce / miningTime);

        console.log(`
╔══════════════════════════════════════════╗
║  BLOCK MINED SUCCESSFULLY                ║
╠══════════════════════════════════════════╣
║  Index: ${this.index.toString().padEnd(30)} ║
║  Hash: ${this.hash.substring(0, 20)}...          ║
║  Nonce: ${this.nonce.toString().padEnd(29)} ║
║  Time: ${miningTime.toFixed(2)}s${' '.repeat(26)} ║
║  Hashrate: ${hashRate.toLocaleString()} H/s${' '.repeat(17)} ║
╚══════════════════════════════════════════╝
        `);

        return this;
    }

    /**
     * Validate all transactions in block
     * @param {Blockchain} blockchain - Reference to blockchain
     * @returns {boolean} True if all transactions valid
     */
    hasValidTransactions(blockchain) {
        // Skip validation for genesis block
        if (this.index === 0) return true;

        // Check for duplicate transactions
        const txIds = new Set();
        
        for (const tx of this.transactions) {
            // Check for duplicates
            if (txIds.has(tx.id)) {
                console.error(`❌ Duplicate transaction: ${tx.id}`);
                return false;
            }
            txIds.add(tx.id);

            // Validate transaction
            if (!tx.isValid(blockchain)) {
                console.error(`❌ Invalid transaction: ${tx.id}`);
                return false;
            }
        }

        // Verify Merkle root
        const calculatedRoot = this.calculateMerkleRoot();
        if (calculatedRoot !== this.merkleRoot) {
            console.error('❌ Merkle root mismatch');
            return false;
        }

        return true;
    }

    /**
     * Check if block contains coinbase transaction
     * @returns {boolean}
     */
    hasCoinbase() {
        return this.transactions.length > 0 && 
               this.transactions[0].isCoinbase && 
               this.transactions[0].isCoinbase();
    }

    /**
     * Get coinbase transaction (mining reward)
     * @returns {Transaction|null}
     */
    getCoinbase() {
        return this.hasCoinbase() ? this.transactions[0] : null;
    }

    /**
     * Get total transaction fees in block
     * @returns {number}
     */
    getTotalFees() {
        let total = 0;
        for (let i = 1; i < this.transactions.length; i++) {
            total += this.transactions[i].fee || 0;
        }
        return total;
    }

    /**
     * Serialize block to JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            index: this.index,
            timestamp: this.timestamp,
            transactions: this.transactions.map(tx => tx.toJSON?.() || tx),
            previousHash: this.previousHash,
            nonce: this.nonce,
            miner: this.miner,
            merkleRoot: this.merkleRoot,
            hash: this.hash,
            size: this.size,
            version: this.version
        };
    }

    /**
     * Create block from JSON
     * @param {Object|string} json - JSON data
     * @returns {Block}
     */
    static fromJSON(json) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        
        // Reconstruct transactions
        const transactions = (data.transactions || []).map(tx => 
            Transaction ? Transaction.fromJSON(tx) : tx
        );

        const block = new Block(
            data.index,
            data.timestamp,
            transactions,
            data.previousHash,
            data.nonce,
            data.miner
        );

        // Restore computed properties
        block.merkleRoot = data.merkleRoot;
        block.hash = data.hash;
        block.size = data.size;
        block.version = data.version || '1.0.0';

        return block;
    }

    /**
     * Validate block structure
     * @returns {boolean}
     */
    validateStructure() {
        return (
            typeof this.index === 'number' &&
            typeof this.timestamp === 'number' &&
            Array.isArray(this.transactions) &&
            typeof this.previousHash === 'string' &&
            typeof this.nonce === 'number' &&
            typeof this.hash === 'string' &&
            this.hash.length === 64 &&
            (!this.miner || typeof this.miner === 'string')
        );
    }

    /**
     * Print block details
     */
    print() {
        console.log(`
Block #${this.index}
────────────────────────────────
Hash:        ${this.hash}
Previous:    ${this.previousHash}
Merkle Root: ${this.merkleRoot}
Timestamp:   ${new Date(this.timestamp).toISOString()}
Nonce:       ${this.nonce}
Miner:       ${this.miner || 'N/A'}
Transactions: ${this.transactions.length}
Size:        ${this.size} bytes
Version:     ${this.version}
        `);
    }
}

module.exports = Block;