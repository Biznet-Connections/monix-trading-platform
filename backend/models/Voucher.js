const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    days_valid: { type: Number, required: true },
    trades_limit: { type: Number, required: true },
    created_by: { type: String, default: 'system' },
    used_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    used_at: { type: Date, default: null },
}, { timestamps: { createdAt: 'created_at' } });

// REMOVED: voucherSchema.index({ code: 1 }) — unique: true already creates index

const VoucherModel = mongoose.model('Voucher', voucherSchema);

class Voucher {
    static async getAll() { return VoucherModel.find().lean(); }
    static async getByCode(code) { return VoucherModel.findOne({ code }); }
    static async create(voucherData) { return VoucherModel.create(voucherData); }
    static async markUsed(code, userId) { return VoucherModel.findOneAndUpdate({ code, used_by: null }, { used_by: userId, used_at: new Date() }, { new: true }); }
    static async revoke(code) { return VoucherModel.findOneAndDelete({ code }); }
    static async getStats() {
        const total = await VoucherModel.countDocuments();
        const unused = await VoucherModel.countDocuments({ used_by: null });
        return { total, unused, used: total - unused };
    }
}

module.exports = Voucher;
