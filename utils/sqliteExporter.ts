import initSqlJs, { Database } from 'sql.js';
import { db } from '../db';

export async function generateSQLiteDatabase(): Promise<Uint8Array> {
    const SQL = await initSqlJs({
        locateFile: (file) => `https://sql.js.org/dist/${file}`
    });

    const sqliteDb: Database = new SQL.Database();

    // 1. Create Relational Tables DDL
    sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS general_ledger_accounts (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            name_fa TEXT,
            category TEXT
        );

        CREATE TABLE IF NOT EXISTS subsidiary_ledger_accounts (
            id TEXT PRIMARY KEY,
            general_account_id TEXT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            name_fa TEXT
        );

        CREATE TABLE IF NOT EXISTS detailed_ledger_accounts (
            id TEXT PRIMARY KEY,
            subsidiary_account_id TEXT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            name_fa TEXT
        );

        CREATE TABLE IF NOT EXISTS journal_vouchers (
            id TEXT PRIMARY KEY,
            voucher_number INTEGER NOT NULL,
            date TEXT NOT NULL,
            description TEXT,
            total_debit REAL DEFAULT 0,
            total_credit REAL DEFAULT 0,
            status TEXT DEFAULT 'posted',
            source_type TEXT,
            source_id TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS journal_voucher_items (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            account_code TEXT NOT NULL,
            account_name TEXT,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0,
            description TEXT,
            FOREIGN KEY (voucher_id) REFERENCES journal_vouchers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS purchase_invoices (
            id TEXT PRIMARY KEY,
            invoice_number TEXT NOT NULL,
            supplier_name TEXT NOT NULL,
            supplier_id TEXT,
            date TEXT NOT NULL,
            due_date TEXT,
            subtotal REAL DEFAULT 0,
            additional_costs REAL DEFAULT 0,
            total_amount REAL DEFAULT 0,
            currency TEXT DEFAULT 'USD',
            status TEXT DEFAULT 'posted',
            order_id TEXT,
            voucher_id TEXT,
            notes TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS purchase_invoice_items (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            product_id TEXT,
            internal_code TEXT,
            product_name TEXT NOT NULL,
            quantity REAL DEFAULT 0,
            unit_price REAL DEFAULT 0,
            total_price REAL DEFAULT 0,
            FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sales_invoices (
            id TEXT PRIMARY KEY,
            invoice_number TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT,
            date TEXT NOT NULL,
            subtotal REAL DEFAULT 0,
            discount REAL DEFAULT 0,
            tax REAL DEFAULT 0,
            total_amount REAL DEFAULT 0,
            currency TEXT DEFAULT 'USD',
            status TEXT DEFAULT 'unpaid',
            order_id TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sales_invoice_items (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            internal_code TEXT,
            quantity REAL DEFAULT 0,
            unit_price REAL DEFAULT 0,
            total_price REAL DEFAULT 0,
            FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            internal_code TEXT,
            supplier TEXT NOT NULL,
            order_date TEXT,
            approx_loading_date TEXT,
            status TEXT,
            total_amount REAL DEFAULT 0,
            currency TEXT DEFAULT 'USD',
            is_finalized INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            internal_code TEXT,
            supplier_code TEXT,
            quantity REAL DEFAULT 0,
            price REAL DEFAULT 0,
            total_price REAL DEFAULT 0,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            name_fa TEXT,
            internal_code TEXT,
            category TEXT,
            sub_category TEXT,
            brand TEXT,
            hs_code TEXT
        );

        CREATE TABLE IF NOT EXISTS financial_transactions (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            amount REAL DEFAULT 0,
            currency TEXT DEFAULT 'USD',
            description TEXT,
            supplier_id TEXT,
            account_id TEXT
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            expense_number TEXT,
            category TEXT,
            date TEXT NOT NULL,
            amount REAL DEFAULT 0,
            currency TEXT DEFAULT 'USD',
            description TEXT
        );
    `);

    // 2. Fetch All Data from Dexie IndexedDB
    const generalAccs = await db.generalLedgerAccounts.toArray();
    const subAccs = await db.subsidiaryLedgerAccounts.toArray();
    const detAccs = await db.detailedLedgerAccounts.toArray();
    const vouchers = await db.journalVouchers.toArray();
    const purchaseInvs = await db.purchaseInvoices.toArray();
    const salesInvs = await db.salesInvoices.toArray();
    const ordersList = await db.orders.toArray();
    const productsList = await db.products.toArray();
    const txsList = await db.transactions.toArray();
    const expList = await db.expenses.toArray();

    // Helper execute statement
    const insert = (table: string, fields: string[], values: any[]) => {
        const placeholders = fields.map(() => '?').join(', ');
        const stmt = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders});`;
        sqliteDb.run(stmt, values);
    };

    // Populate Chart of Accounts
    for (const g of generalAccs) {
        insert('general_ledger_accounts', ['id', 'code', 'name', 'name_fa', 'category'], [g.id, g.code, g.name, g.name_fa || null, g.category || null]);
    }
    for (const s of subAccs) {
        insert('subsidiary_ledger_accounts', ['id', 'general_account_id', 'code', 'name', 'name_fa'], [s.id, s.generalLedgerAccountId, s.code, s.name, s.name_fa || null]);
    }
    for (const d of detAccs) {
        insert('detailed_ledger_accounts', ['id', 'subsidiary_account_id', 'code', 'name', 'name_fa'], [d.id, d.subsidiaryLedgerAccountId, d.code, d.name, d.name_fa || null]);
    }

    // Populate Journal Vouchers
    for (const v of vouchers) {
        insert('journal_vouchers', ['id', 'voucher_number', 'date', 'description', 'total_debit', 'total_credit', 'status', 'source_type', 'source_id', 'created_at'], 
            [v.id, v.voucherNumber, v.date, v.description, v.totalDebit, v.totalCredit, v.status || 'posted', v.sourceType || 'manual', v.sourceId || null, v.createdAt]);
        
        for (const item of v.items || []) {
            insert('journal_voucher_items', ['id', 'voucher_id', 'account_code', 'account_name', 'debit', 'credit', 'description'],
                [item.id, v.id, item.accountCode || item.accountId, item.accountName || null, item.debit || 0, item.credit || 0, item.description || null]);
        }
    }

    // Populate Purchase Invoices
    for (const p of purchaseInvs) {
        insert('purchase_invoices', ['id', 'invoice_number', 'supplier_name', 'supplier_id', 'date', 'due_date', 'subtotal', 'additional_costs', 'total_amount', 'currency', 'status', 'order_id', 'voucher_id', 'notes', 'created_at'],
            [p.id, p.invoiceNumber, p.supplierName, p.supplierId || null, p.date, p.dueDate || null, p.subtotal || 0, p.additionalCosts || 0, p.totalAmount, p.currency, p.status || 'posted', p.orderId || null, p.voucherId || null, p.notes || null, p.createdAt]);

        for (const item of p.items || []) {
            insert('purchase_invoice_items', ['id', 'invoice_id', 'product_id', 'internal_code', 'product_name', 'quantity', 'unit_price', 'total_price'],
                [item.id, p.id, item.productId || null, item.internalCode || null, item.productName, item.quantity || 0, item.unitPrice || 0, item.totalPrice || 0]);
        }
    }

    // Populate Sales Invoices
    for (const s of salesInvs) {
        insert('sales_invoices', ['id', 'invoice_number', 'customer_name', 'customer_phone', 'date', 'subtotal', 'discount', 'tax', 'total_amount', 'currency', 'status', 'order_id', 'created_at'],
            [s.id, s.invoiceNumber, s.customerName, s.customerPhone || null, s.date, s.subtotal || 0, s.discount || 0, s.tax || 0, s.totalAmount, s.currency, s.status || 'unpaid', s.orderId || null, s.createdAt]);

        for (const item of s.items || []) {
            insert('sales_invoice_items', ['id', 'invoice_id', 'product_name', 'internal_code', 'quantity', 'unit_price', 'total_price'],
                [item.id, s.id, item.productName, item.internalCode || null, item.quantity || 0, item.unitPrice || 0, item.totalPrice || 0]);
        }
    }

    // Populate Orders
    for (const o of ordersList) {
        insert('orders', ['id', 'internal_code', 'supplier', 'order_date', 'approx_loading_date', 'status', 'total_amount', 'currency', 'is_finalized', 'is_archived'],
            [o.id, o.internalCode || null, o.supplier, o.orderDate || null, o.approxLoadingDate || null, o.status, o.totalAmount || 0, o.currency || 'USD', o.isFinalized ? 1 : 0, o.isArchived ? 1 : 0]);

        for (const item of o.items || []) {
            insert('order_items', ['id', 'order_id', 'product_name', 'internal_code', 'supplier_code', 'quantity', 'price', 'total_price'],
                [item.id, o.id, item.productName, item.internalCode || null, item.supplierCode || null, item.quantity || 0, item.price || 0, (item.quantity || 0) * (item.price || 0)]);
        }
    }

    // Populate Products
    for (const pr of productsList) {
        insert('products', ['id', 'name', 'name_fa', 'internal_code', 'category', 'sub_category', 'brand', 'hs_code'],
            [pr.id, pr.name, pr.name_fa || null, pr.internalCode || null, pr.category || null, pr.subCategory || null, pr.brand || null, pr.hsCode || null]);
    }

    // Populate Financial Transactions
    for (const tx of txsList) {
        insert('financial_transactions', ['id', 'date', 'type', 'amount', 'currency', 'description', 'supplier_id', 'account_id'],
            [tx.id, tx.date, tx.type, tx.amount, tx.currency, tx.description || null, tx.supplierId || null, tx.accountId || null]);
    }

    // Populate Expenses
    for (const ex of expList) {
        insert('expenses', ['id', 'expense_number', 'category', 'date', 'amount', 'currency', 'description'],
            [ex.id, ex.expenseNumber || null, ex.category || null, ex.date, ex.amount, ex.currency, ex.description || null]);
    }

    // Export Binary SQLite File
    const binaryArray = sqliteDb.export();
    sqliteDb.close();
    return binaryArray;
}

export async function generateSQLScriptDump(): Promise<string> {
    const uint8Array = await generateSQLiteDatabase();
    const SQL = await initSqlJs({
        locateFile: (file) => `https://sql.js.org/dist/${file}`
    });
    const sqliteDb = new SQL.Database(uint8Array);

    // Get all tables
    const res = sqliteDb.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    let script = `-- NEWLAND ERP & DOUBLE-ENTRY ACCOUNTING SQLITE SCRIPT DUMP\n`;
    script += `-- Generated on: ${new Date().toISOString()}\n\n`;

    if (res.length > 0 && res[0].values) {
        for (const row of res[0].values) {
            const tableName = row[0] as string;
            const createSql = row[1] as string;
            script += `-- Table: ${tableName}\n`;
            script += `${createSql};\n\n`;

            const rowsRes = sqliteDb.exec(`SELECT * FROM ${tableName};`);
            if (rowsRes.length > 0 && rowsRes[0].values) {
                const cols = rowsRes[0].columns;
                for (const valRow of rowsRes[0].values) {
                    const formattedVals = valRow.map(v => {
                        if (v === null || v === undefined) return 'NULL';
                        if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
                        return v;
                    });
                    script += `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${formattedVals.join(', ')});\n`;
                }
                script += `\n`;
            }
        }
    }

    sqliteDb.close();
    return script;
}
