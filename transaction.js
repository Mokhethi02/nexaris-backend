/**
 * Nexaris Blockchain Core
 * transaction.js - Transaction Structure & Validation
 * 
 * Author: Moeti Solomon Mokhethi
 * Copyright © 2026 Nexaris Foundation
 * Version: 1.0.0
 */

const crypto = require('crypto');

class Transaction {
    constructor(from, to, amount, fee = 0.0001, data = '') {
        this.from = from;
        this.to = to;
        this.amount = amount;
        this.fee = fee;
        this.data = data;
        this.timestamp = Date.now();
        this.id = this.calculateHash();
        this.signature = null;
        this.version = '1.0.0';
    }

    calculateHash() {
        const txData = 
            (this.from || 'coinbase') + 
            this.to + 
            this.amount + 
            this.fee + 
            this.timestamp + 
            this.data;

        return crypto
            .createHash('sha256')
            .update(txData)
            .digest('hex');
    }

    sign(privateKey) {
        // For demo purposes, we'll create a mock signature
        // In production, this would use real crypto signing
        this.signature = 'signed_' + this.id.substring(0, 20);
        return this;
    }

    isValid(blockchain) {
        // Coinbase transaction (mining reward) - ALWAYS VALID
        if (!this.from || this.from === 'coinbase') {
            return true;
        }

        // For demo purposes, accept transactions with mock signatures
        if (this.signature && this.signature.startsWith('signed_')) {
            return true;
        }

        // Check if signature exists
        if (!this.signature) {
            return false;
        }

        return true;
    }

    isCoinbase() {
        return !this.from || this.from === 'coinbase';
    }

    toJSON() {
        return {
            id: this.id,
            from: this.from,
            to: this.to,
            amount: this.amount,
            fee: this.fee,
            timestamp: this.timestamp,
            data: this.data,
            signature: this.signature,
            version: this.version
        };
    }

    static fromJSON(json) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const tx = new Transaction(
            data.from,
            data.to,
            data.amount,
            data.fee,
            data.data
        );
        tx.timestamp = data.timestamp;
        tx.id = data.id;
        tx.signature = data.signature;
        tx.version = data.version || '1.0.0';
        return tx;
    }
}

module.exports = { Transaction };