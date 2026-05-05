const db = require('../config/database').getDb();

class Voucher {
    static async create(voucherData) {
        const { days_valid, trades_limit, created_by } = voucherData;
        const code = `MONIX-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        
        const vouchers = db.vouchers.getAll();
        const newId = vouchers.length > 0 ? Math.max(...vouchers.map(v => v.id)) + 1 : 1;
        
        const newVoucher = {
            id: newId,
            code,
            days_valid,
            trades_limit,
            created_by: created_by || 'admin',
            used_by: null,
            used_at: null,
            created_at: new Date().toISOString()
        };
        
        vouchers.push(newVoucher);
        return { id: newId, code };
    }
    
    static async findByCode(code) {
        return db.vouchers.getByCode(code);
    }
    
    static async markUsed(code, userId) {
        return db.vouchers.markUsed(code, userId);
    }
    
    static async revoke(code) {
        return db.vouchers.revoke(code);
    }
    
    static async getAll() {
        return db.vouchers.getAll();
    }
    
    static async getUnused() {
        const vouchers = db.vouchers.getAll();
        return vouchers.filter(v => !v.used_by);
    }
    
    static async getStats() {
        return db.vouchers.getStats();
    }
}

module.exports = Voucher;
