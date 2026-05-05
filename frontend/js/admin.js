let currentAdminUserList = [];

function initAdmin() {
    const adminLink = document.getElementById('adminLink');
    if (adminLink) {
        adminLink.addEventListener('click', () => openAdminModal());
    }
    
    const generateVoucherBtn = document.getElementById('generateVoucherBtn');
    if (generateVoucherBtn) {
        generateVoucherBtn.addEventListener('click', generateVoucher);
    }
    
    const sendBroadcastBtn = document.getElementById('sendBroadcastBtn');
    if (sendBroadcastBtn) {
        sendBroadcastBtn.addEventListener('click', sendBroadcast);
    }
    
    // Admin tab switching
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => switchAdminTab(tab.dataset.tab));
    });
}

async function openAdminModal() {
    const modal = document.getElementById('adminModal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    await loadAdminVouchers();
    await loadAdminUsers();
    await loadAdminStats();
}

function switchAdminTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(tab => {
        if (tab.dataset.tab === tabId) {
            tab.classList.add('active');
            tab.classList.remove('text-slate-400');
        } else {
            tab.classList.remove('active');
            tab.classList.add('text-slate-400');
        }
    });
    
    // Update panes
    document.querySelectorAll('.admin-tab-pane').forEach(pane => {
        pane.classList.add('hidden');
    });
    document.getElementById(`${tabId}Tab`).classList.remove('hidden');
}

async function generateVoucher() {
    const days = document.getElementById('voucherDays')?.value;
    const trades = document.getElementById('voucherTrades')?.value;
    
    if (!days || !trades || days < 1 || trades < 1) {
        showToast('Error', 'Please enter valid days and trades', 'error');
        return;
    }
    
    try {
        const result = await window.api.adminGenerateVoucher(parseInt(days), parseInt(trades));
        if (result.success) {
            showToast('Voucher Generated', `Code: ${result.voucher.code}`, 'success');
            document.getElementById('voucherDays').value = '';
            document.getElementById('voucherTrades').value = '';
            await loadAdminVouchers();
        }
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function loadAdminVouchers() {
    try {
        const result = await window.api.adminGetVouchers();
        const container = document.getElementById('vouchersList');
        
        if (!container) return;
        
        if (!result.vouchers || result.vouchers.length === 0) {
            container.innerHTML = '<p class="text-slate-500 text-center py-4">No vouchers generated yet</p>';
            return;
        }
        
        container.innerHTML = result.vouchers.map(v => `
            <div class="bg-slate-800/30 p-3 rounded-lg flex justify-between items-center">
                <div>
                    <p class="font-mono text-sm font-bold text-indigo-300">${v.code}</p>
                    <p class="text-xs text-slate-500">${v.days_valid} days • ${v.trades_limit} trades</p>
                    <p class="text-xs text-slate-500">Created: ${new Date(v.created_at).toLocaleDateString()}</p>
                </div>
                <div class="text-right">
                    ${v.used_by ? `<p class="text-xs text-emerald-400">Used by: ${v.used_by_username || v.used_by_email}</p>` : '<p class="text-xs text-yellow-500">Unused</p>'}
                    <button onclick="revokeVoucher('${v.code}')" class="text-xs text-red-400 hover:text-red-300 mt-1">Revoke</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load vouchers error:', error);
    }
}

async function revokeVoucher(code) {
    if (!confirm(`Revoke voucher ${code}?`)) return;
    
    try {
        await window.api.adminRevokeVoucher(code);
        showToast('Voucher Revoked', `Voucher ${code} has been revoked`, 'success');
        await loadAdminVouchers();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function loadAdminUsers() {
    try {
        const users = await window.api.adminGetUsers();
        currentAdminUserList = users;
        const container = document.getElementById('usersList');
        
        if (!container) return;
        
        if (!users || users.length === 0) {
            container.innerHTML = '<p class="text-slate-500 text-center py-4">No users found</p>';
            return;
        }
        
        container.innerHTML = users.map(user => `
            <div class="bg-slate-800/30 p-3 rounded-lg">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-semibold">${user.username}</p>
                        <p class="text-xs text-slate-500">${user.email}</p>
                        <p class="text-xs text-slate-500 mt-1">Trades left: ${user.trades_remaining} | Win rate: ${user.stats?.win_rate || 0}%</p>
                        <p class="text-xs text-slate-500">Profit: $${user.stats?.net_profit || 0}</p>
                    </div>
                    <div class="text-right">
                        ${user.is_admin ? '<span class="text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded">Admin</span>' : ''}
                        <div class="flex gap-2 mt-2">
                            ${!user.is_active ? `<button onclick="unblockUser(${user.id})" class="text-xs bg-emerald-600 px-2 py-1 rounded">Unblock</button>` : `<button onclick="blockUser(${user.id})" class="text-xs bg-red-600 px-2 py-1 rounded">Block</button>`}
                            <button onclick="resetTrades(${user.id})" class="text-xs bg-blue-600 px-2 py-1 rounded">Reset Trades</button>
                            ${!user.is_admin ? `<button onclick="makeAdmin(${user.id})" class="text-xs bg-amber-600 px-2 py-1 rounded">Make Admin</button>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load users error:', error);
    }
}

async function blockUser(userId) {
    if (!confirm('Block this user?')) return;
    try {
        await window.api.adminBlockUser(userId);
        showToast('User Blocked', 'User has been blocked', 'success');
        await loadAdminUsers();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function unblockUser(userId) {
    try {
        await window.api.adminUnblockUser(userId);
        showToast('User Unblocked', 'User has been unblocked', 'success');
        await loadAdminUsers();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function resetTrades(userId) {
    const trades = prompt('Enter number of trades to give:');
    if (!trades || isNaN(trades)) return;
    
    try {
        await window.api.adminResetTrades(userId, parseInt(trades));
        showToast('Trades Reset', `User received ${trades} trades`, 'success');
        await loadAdminUsers();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function makeAdmin(userId) {
    if (!confirm('Grant admin privileges to this user?')) return;
    try {
        await window.api.adminAddAdmin(userId);
        showToast('Admin Granted', 'User now has admin access', 'success');
        await loadAdminUsers();
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function sendBroadcast() {
    const subject = document.getElementById('broadcastSubject')?.value;
    const message = document.getElementById('broadcastMessage')?.value;
    
    if (!subject || !message) {
        showToast('Error', 'Please enter subject and message', 'error');
        return;
    }
    
    try {
        const result = await window.api.adminSendBroadcast(subject, message);
        if (result.success) {
            showToast('Broadcast Sent', result.message, 'success');
            document.getElementById('broadcastSubject').value = '';
            document.getElementById('broadcastMessage').value = '';
        }
    } catch (error) {
        showToast('Error', error.message, 'error');
    }
}

async function loadAdminStats() {
    try {
        const stats = await window.api.adminGetStats();
        const container = document.getElementById('systemStats');
        
        if (!container) return;
        
        container.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-800/30 p-3 rounded-lg text-center">
                    <p class="text-2xl font-bold text-indigo-400">${stats.total_users || 0}</p>
                    <p class="text-xs text-slate-500">Total Users</p>
                </div>
                <div class="bg-slate-800/30 p-3 rounded-lg text-center">
                    <p class="text-2xl font-bold text-indigo-400">${stats.active_users || 0}</p>
                    <p class="text-xs text-slate-500">Active (7d)</p>
                </div>
                <div class="bg-slate-800/30 p-3 rounded-lg text-center">
                    <p class="text-2xl font-bold text-emerald-400">${stats.total_trades || 0}</p>
                    <p class="text-xs text-slate-500">Total Trades</p>
                </div>
                <div class="bg-slate-800/30 p-3 rounded-lg text-center">
                    <p class="text-2xl font-bold ${stats.total_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}">$${stats.total_profit || 0}</p>
                    <p class="text-xs text-slate-500">Total Profit</p>
                </div>
                <div class="bg-slate-800/30 p-3 rounded-lg text-center">
                    <p class="text-2xl font-bold">${stats.win_rate || 0}%</p>
                    <p class="text-xs text-slate-500">Win Rate</p>
                </div>
                <div class="bg-slate-800/30 p-3 rounded-lg text-center">
                    <p class="text-2xl font-bold text-emerald-400">$${stats.today_profit || 0}</p>
                    <p class="text-xs text-slate-500">Today's Profit</p>
                </div>
            </div>
            <div class="mt-4 bg-slate-800/30 p-3 rounded-lg">
                <p class="text-sm"><span class="text-slate-500">Vouchers:</span> ${stats.vouchers?.total || 0} total (${stats.vouchers?.unused || 0} unused)</p>
                <p class="text-sm mt-1"><span class="text-slate-500">System Status:</span> <span class="text-emerald-400">${stats.system_status || 'online'}</span></p>
                <p class="text-sm mt-1"><span class="text-slate-500">Version:</span> ${stats.version || '3.0.0'}</p>
            </div>
        `;
    } catch (error) {
        console.error('Load stats error:', error);
    }
}

// Expose admin functions globally
window.initAdmin = initAdmin;
window.revokeVoucher = revokeVoucher;
window.blockUser = blockUser;
window.unblockUser = unblockUser;
window.resetTrades = resetTrades;
window.makeAdmin = makeAdmin;
