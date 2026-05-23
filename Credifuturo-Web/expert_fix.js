const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("=== STARTING EXPERT FIX ===");

// 1. KILL NODE
try {
    console.log("Killing existing Node processes...");
    if (process.platform === 'win32') {
        execSync('taskkill /F /IM node.exe', { stdio: 'ignore' });
    }
} catch (e) {
    // Ignore error if no node process found
}

// 2. DELETE DATABASE
const dbPath = path.join(__dirname, 'server', 'database.sqlite');
const dbJournal = path.join(__dirname, 'server', 'database.sqlite-journal');

function deleteFile(p) {
    try {
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            console.log(`Deleted: ${p}`);
        }
    } catch (e) {
        console.error(`Failed to delete ${p}: ${e.message}`);
        // Try renaming if delete fails
        try {
            const newName = p + '.old.' + Date.now();
            fs.renameSync(p, newName);
            console.log(`Renamed locked file to: ${newName}`);
        } catch (e2) {
            console.error(`CRITICAL: Could not delete or rename ${p}. Please restart computer.`);
            process.exit(1);
        }
    }
}

deleteFile(dbPath);
deleteFile(dbJournal);

// 3. REWRITE AdminDashboard.jsx (Fix Mojibake + Translation)
const adminDashboardPath = path.join(__dirname, 'client', 'src', 'pages', 'AdminDashboard.jsx');
const adminDashboardContent = `import { useState, useEffect } from 'react';
import axios from 'axios';

// Simple Tab Component
const Tabs = ({ children }) => {
    const [activeTab, setActiveTab] = useState(0);
    return (
        <div>
            <div className="flex border-b border-gray-200 mb-4">
                {children.map((child, index) => (
                    <button
                        key={index}
                        className={'py-2 px-4 text-sm font-medium focus:outline-none ' + (activeTab === index
                            ? 'border-b-2 border-brand-blue text-brand-blue'
                            : 'text-gray-500 hover:text-gray-700')}
                        onClick={() => setActiveTab(index)}
                    >
                        {child.props.label}
                    </button>
                ))}
            </div>
            <div>{children[activeTab]}</div>
        </div>
    );
};

const Tab = ({ children }) => <div>{children}</div>;

const AdminDashboard = () => {
    // State for data
    const [clients, setClients] = useState([]);
    const [savings, setSavings] = useState([]);
    const [loans, setLoans] = useState([]);
    const [disbursedLoans, setDisbursedLoans] = useState([]);

    // Forms state (simplified)
    const [newClient, setNewClient] = useState({ name: '', cedula: '', email: '', password: '123' }); // default pass
    const [newSaving, setNewSaving] = useState({ clientId: '', amount: '', date: '', type: 'Mensual' });
    const [newLoan, setNewLoan] = useState({ clientId: '', amount: '', date: '', purpose: '' });

    // Fetch Data
    const fetchData = async () => {
        try {
            const [clientRes, savingRes, loanRes, disbursedRes] = await Promise.all([
                axios.get('http://localhost:3000/api/admin/clients'),
                axios.get('http://localhost:3000/api/admin/savings'),
                axios.get('http://localhost:3000/api/admin/loans'),
                axios.get('http://localhost:3000/api/admin/disbursed-loans')
            ]);
            setClients(clientRes.data);
            setSavings(savingRes.data);
            setLoans(loanRes.data);
            setDisbursedLoans(disbursedRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Handlers
    const handleAddClient = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3000/api/admin/clients', newClient);
            alert('Cliente agregado');
            fetchData();
            setNewClient({ name: '', cedula: '', email: '', password: '123' });
        } catch (err) { alert('Error: ' + err.response?.data?.error); }
    };

    const handleAddSaving = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3000/api/admin/savings', newSaving);
            alert('Ahorro agregado');
            fetchData();
        } catch (err) { alert('Error'); }
    };

    const handleAddLoan = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3000/api/admin/loans', newLoan);
            alert('Préstamo agregado');
            fetchData();
        } catch (err) { alert('Error'); }
    };

    const handleImportData = async () => {
        if (!confirm('¿Estás seguro de importar los datos desde Excel? Esto podría tomar unos momentos.')) return;
        try {
            alert('Iniciando importación... Por favor espere.');
            const res = await axios.post('http://localhost:3000/api/admin/import-data');
            console.log(res.data);
            alert('Importación completada.\\nRegistros procesados:\\nClientes: ' + (res.data.report.clients.imported || 0) + 
                  '\\nAhorros: ' + (res.data.report.savings.imported || 0) + 
                  '\\nPréstamos: ' + (res.data.report.disbursed.imported || 0) + 
                  '\\nPagos: ' + (res.data.report.payments.imported || 0));
            fetchData();
        } catch (err) {
            console.error(err);
            alert('Error al importar datos: ' + (err.response?.data?.error || err.message));
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Panel de Administración</h1>
                <button 
                    onClick={handleImportData}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center"
                >
                    <span className="mr-2">📥</span> Cargar Excel
                </button>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
                <Tabs>
                    <Tab label="Clientes">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* List */}
                            <div>
                                <h3 className="text-lg font-medium mb-4">Lista de Clientes</h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead>
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cédula</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {clients.map(client => (
                                                <tr key={client.id}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.cedula}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{client.name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.email}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {/* Form */}
                            <div>
                                <h3 className="text-lg font-medium mb-4">Agregar Cliente</h3>
                                <form onSubmit={handleAddClient} className="space-y-4">
                                    <input type="text" placeholder="Cédula" className="w-full p-2 border rounded" value={newClient.cedula} onChange={e => setNewClient({ ...newClient, cedula: e.target.value })} required />
                                    <input type="text" placeholder="Nombre Completo" className="w-full p-2 border rounded" value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} required />
                                    <input type="email" placeholder="Email" className="w-full p-2 border rounded" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} required />
                                    <button type="submit" className="w-full bg-brand-blue text-white p-2 rounded hover:bg-blue-700">Guardar</button>
                                </form>
                            </div>
                        </div>
                    </Tab>
                    <Tab label="Ahorros">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-lg font-medium mb-4">Registro de Ahorros</h3>
                                <ul className="divide-y divide-gray-200">
                                    {savings.map(s => (
                                        <li key={s.id} className="py-2">
                                            <span className="font-medium">{s.Client?.name}:</span>  ({s.type}) - {s.date}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <h3 className="text-lg font-medium mb-4">Registrar Ahorro</h3>
                                <form onSubmit={handleAddSaving} className="space-y-4">
                                    <select className="w-full p-2 border rounded" value={newSaving.clientId} onChange={e => setNewSaving({ ...newSaving, clientId: e.target.value })} required>
                                        <option value="">Seleccionar Cliente</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <input type="number" placeholder="Monto" className="w-full p-2 border rounded" value={newSaving.amount} onChange={e => setNewSaving({ ...newSaving, amount: e.target.value })} required />
                                    <input type="date" className="w-full p-2 border rounded" value={newSaving.date} onChange={e => setNewSaving({ ...newSaving, date: e.target.value })} required />
                                    <select className="w-full p-2 border rounded" value={newSaving.type} onChange={e => setNewSaving({ ...newSaving, type: e.target.value })}>
                                        <option value="Mensual">Mensual</option>
                                        <option value="Aporte Inicial">Aporte Inicial</option>
                                    </select>
                                    <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700">Registrar</button>
                                </form>
                            </div>
                        </div>
                    </Tab>
                    <Tab label="Préstamos">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-lg font-medium mb-4">Solicitudes de Préstamo</h3>
                                <ul className="divide-y divide-gray-200">
                                    {loans.map(l => (
                                        <li key={l.id} className="py-2 flex justify-between">
                                            <span>{l.Client?.name}:  ({l.status})</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <h3 className="text-lg font-medium mb-4">Solicitar Préstamo</h3>
                                <form onSubmit={handleAddLoan} className="space-y-4">
                                    <select className="w-full p-2 border rounded" value={newLoan.clientId} onChange={e => setNewLoan({ ...newLoan, clientId: e.target.value })} required>
                                        <option value="">Seleccionar Cliente</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <input type="number" placeholder="Monto" className="w-full p-2 border rounded" value={newLoan.amount} onChange={e => setNewLoan({ ...newLoan, amount: e.target.value })} required />
                                    <input type="date" className="w-full p-2 border rounded" value={newLoan.date} onChange={e => setNewLoan({ ...newLoan, date: e.target.value })} required />
                                    <input type="text" placeholder="Propósito" className="w-full p-2 border rounded" value={newLoan.purpose} onChange={e => setNewLoan({ ...newLoan, purpose: e.target.value })} required />
                                    <button type="submit" className="w-full bg-yellow-600 text-white p-2 rounded hover:bg-yellow-700">Solicitar</button>
                                </form>
                            </div>
                        </div>
                    </Tab>
                    <Tab label="💰 Desembolsados">
                        <div>
                            <h3 className="text-lg font-medium mb-4">Préstamos Desembolsados</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead>
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orden ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Socio</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Banco</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cuenta</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {disbursedLoans.map(loan => (
                                            <tr key={loan.id}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{loan.orderId}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{loan.socio}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{loan.fechaDesembolso}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                     {/* Formato moneda? */}
                                                     {'\$' + parseFloat(loan.monto).toLocaleString('es-CO')}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{loan.banco}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{loan.cuenta}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                                        {loan.estado}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Tab>
                </Tabs>
            </div>
        </div>
    );
};

export default AdminDashboard;`;

fs.writeFileSync(adminDashboardPath, adminDashboardContent, 'utf8');
console.log("Rewrote AdminDashboard.jsx with valid UTF-8 and translations.");

// 4. REWRITE DataImportService.js (Fix Translations + Robustness)
const importServicePath = path.join(__dirname, 'server', 'services', 'DataImportService.js');
const importServiceContent = `const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const Client = require('../models/Client');
const Saving = require('../models/Saving');
const DisbursedLoan = require('../models/DisbursedLoan');
const LoanPayment = require('../models/LoanPayment');

const ImportService = {
    async importAll(dataDir) {
        const results = {
            clients: await this.importClients(path.join(dataDir, 'Tabla_Clientes.xlsx')),
            savings: await this.importSavings(dataDir),
            disbursed: await this.importDisbursed(path.join(dataDir, '1-orders_table_prestamos_desembolsados.xlsx')),
            payments: await this.importPayments(path.join(dataDir, '1-orders_table_estado_prestamos.xlsx'))
        };
        return results;
    },

    async importClients(filePath) {
        if (!fs.existsSync(filePath)) return { error: 'Archivo no encontrado: ' + path.basename(filePath) };

        const wb = XLSX.readFile(filePath);
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        let count = 0;

        for (const row of data) {
            try {
                const customerId = row['Customer_id'] || ('CUS-' + row['Id_VM']);

                await Client.findOrCreate({
                    where: { customerId: customerId.toString() },
                    defaults: {
                        cedula: row['Id_VM'] ? row['Id_VM'].toString() : 'SIN_CEDULA',
                        name: row['Nombre'],
                        surname1: row['1 Apellido'],
                        surname2: row['2 Apellido'],
                        genero: row['Genero'],
                        pais: row['Pais'],
                        ciudad: row['Ciudad'],
                        tipoCliente: row['Tipo de Cliente'],
                        socioFundador: row['Socio Fundador'],
                        referido: row['Referido'],
                        cargo: row['Cargo'],
                        fechaIngreso: this.parseExcelDate(row['Fecha de Ingreso']),
                        estatus: row['Estado'],
                        email: customerId + '@credifuturo.com',
                        password: '123'
                    }
                });
                count++;
            } catch (err) {
                console.error('Error importing client row:', err.message);
            }
        }
        return { imported: count };
    },

    async importSavings(dataDir) {
        const monthlyFile = path.join(dataDir, '1-orders_table_ahorro_mensual.xlsx');
        const initialFile = path.join(dataDir, '1-orders_table_aportes_iniciales.xlsx');
        let count = 0;

        const processSaving = async (filePath, type) => {
            if (!fs.existsSync(filePath)) return;
            const wb = XLSX.readFile(filePath);
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

            for (const row of data) {
                const customerId = row['Customer_id'] || ('CUS-' + row['Id_VM']);
                const client = await Client.findOne({ where: { customerId: customerId.toString() } });

                if (client) {
                    await Saving.create({
                        clientId: client.id,
                        amount: row['Valor Mensual'] || row['Valor'] || 0,
                        date: this.parseExcelDate(row['Fecha Pago']),
                        type: type,
                        banco: row['Banco'],
                        numeroTransaccion: row['# Transaccion'],
                        origen: row['Desde Cuenta de Ahorros'],
                        penalizacion: row['Penalizacion'],
                        diasPenalizacion: row['Dias Penalizacion'],
                        valorAhorrado: row['Valor Ahorrado'],
                        year: row['Año pago'] || row['Año'] || row['AÃ±o pago'] || row['AÃ±o'],
                        month: row['Mes pago'] || row['Mes']
                    });
                    count++;
                }
            }
        };

        await processSaving(monthlyFile, 'Mensual');
        await processSaving(initialFile, 'Aporte Inicial');
        return { imported: count };
    },

    async importDisbursed(filePath) {
        if (!fs.existsSync(filePath)) return { error: 'Archivo no encontrado: ' + path.basename(filePath) };
        const wb = XLSX.readFile(filePath);
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        let count = 0;

        for (const row of data) {
            const customerId = row['Customer_id'] || ('CUS-' + row['Id_VM']);
            const client = await Client.findOne({ where: { customerId: customerId.toString() } });

            // Robustness: Handle basic required fields
            const monto = row['Valor Prestado'] || row['Valor Prestado '];
            if (!monto) {
                console.warn('Skipping disbursed loan row due to missing Amount (Valor Prestado)', row);
                continue;
            }

            await DisbursedLoan.create({
                clientId: client ? client.id : null,
                orderId: row['Id_VM'],
                socio: row['Nombre'] + ' ' + row['Apellido'],
                fechaDesembolso: this.parseExcelDate(row['Fecha Prestamo']),
                monto: monto,
                banco: row['Banco desembolsado'],
                cuenta: row['Cuenta de Ahorros'],
                estado: row['Estado'],
                cuotas: row['# Cuotas Prestamo'],
                interesMensual: row['Interes Mensual'],
                diasPagoMax: row['Dias de pago Max'] || row['Dias de pago Max ']
            });
            count++;
        }
        return { imported: count };
    },

    async importPayments(filePath) {
        if (!fs.existsSync(filePath)) return { error: 'Archivo no encontrado: ' + path.basename(filePath) };
        const wb = XLSX.readFile(filePath);
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        let count = 0;

        for (const row of data) {
            const customerId = row['Customer_id'] || ('CUS-' + row['Id_EP']);
            const client = await Client.findOne({ where: { customerId: customerId.toString() } });

            let loanId = null;
            if (row['Id_VM']) {
                const loan = await DisbursedLoan.findOne({ where: { orderId: row['Id_VM'].toString() } });
                if (loan) loanId = loan.id;
            }

            // Robustness
            if (!row['Id_EP'] && !row['Id_VM']) continue;

            await LoanPayment.create({
                clientId: client ? client.id : null,
                loanId: loanId,
                externalId: row['Id_EP'],
                mesDesembolso: row['Mes Desembolso'] || row['Mes Desembolso '],
                saldoInicial: row['Saldo Inicial'],
                cuotasPrestamo: row['# Cuotas Prestamo'],
                interesMensual: row['Interes Mensual'],
                valorInteresesAmortizados: row['Valor Intereses amortizados'],
                fechaPagoMax: this.parseExcelDate(row['Fecha de Pago Max']),
                mesPago: row['Mes de Pago'],
                valorCuotaVariable: row['Valor Cuota Variable'],
                estado: row['Estado'],
                valorCuotaPago: row['Valor Cuota Pago'],
                saldoFinal: row['Saldo Final'],
                banco: row['Banco desembolsado'],
                numeroTransaccion: row['# Transaccion'],
                cuentaAhorros: row['Cuenta de Ahorros'],
                observaciones: row['Observaciones'],
                estadoPrestamo: row['Estado Prestamo']
            });
            count++;
        }
        return { imported: count };
    },

    parseExcelDate(excelDate) {
        if (!excelDate) return null;
        if (typeof excelDate === 'number') {
            return new Date(Math.round((excelDate - 25569) * 864e5));
        }
        return new Date(excelDate);
    }
};

module.exports = ImportService;`;

fs.writeFileSync(importServicePath, importServiceContent, 'utf8');
console.log("Rewrote DataImportService.js.");

// 5. REWRITE admin.js (Fix Translations)
const adminRoutePath = path.join(__dirname, 'server', 'routes', 'admin.js');
const adminRouteContent = `const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Saving = require('../models/Saving');
const Loan = require('../models/Loan');
const DisbursedLoan = require('../models/DisbursedLoan');
const LoanPayment = require('../models/LoanPayment');
const bcrypt = require('bcryptjs');

// Middleware to check Admin
const isAdmin = (req, res, next) => {
    next();
};

// --- Clients ---
router.get('/clients', async (req, res) => {
    try {
        const clients = await Client.findAll();
        res.json(clients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/clients', async (req, res) => {
    try {
        const { cedula, name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newClient = await Client.create({ cedula, name, email, password: hashedPassword });
        res.status(201).json(newClient);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Savings ---
router.get('/savings', async (req, res) => {
    try {
        const savings = await Saving.findAll({ include: Client });
        res.json(savings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/savings', async (req, res) => {
    try {
        const { clientId, amount, date, type } = req.body;
        const saving = await Saving.create({ clientId, amount, date, type });
        res.status(201).json(saving);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Loans ---
router.get('/loans', async (req, res) => {
    try {
        const loans = await Loan.findAll({ include: Client });
        res.json(loans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/loans', async (req, res) => {
    try {
        const { clientId, amount, date, purpose } = req.body;
        const loan = await Loan.create({ clientId, amount, date, purpose, status: 'Pending' });
        res.status(201).json(loan);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/loans/:id', async (req, res) => {
    try {
        const { status } = req.body;
        const loan = await Loan.findByPk(req.params.id);
        if (!loan) return res.status(404).json({ message: 'Préstamo no encontrado' });
        loan.status = status;
        await loan.save();
        res.json(loan);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Disbursed Loans ---
router.get('/disbursed-loans', async (req, res) => {
    try {
        const disbursedLoans = await DisbursedLoan.findAll({ 
            include: Client,
            order: [['fechaDesembolso', 'DESC']]
        });
        res.json(disbursedLoans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/disbursed-loans', async (req, res) => {
    try {
        const { orderId, socio, fechaDesembolso, monto, banco, cuenta, estado, clientId } = req.body;
        const disbursedLoan = await DisbursedLoan.create({ 
            orderId, 
            socio, 
            fechaDesembolso, 
            monto, 
            banco, 
            cuenta, 
            estado,
            clientId 
        });
        res.status(201).json(disbursedLoan);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Import Data ---
const ImportService = require('../services/DataImportService');

router.post('/import-data', async (req, res) => {
    try {
        const dataDir = 'C://Credifuturo'; 
        console.log('Starting import from:', dataDir);
        const report = await ImportService.importAll(dataDir);
        res.json({ message: 'Importación completada', report });
    } catch (err) {
        console.error('Import error:', err);
        res.status(500).json({ error: 'Error en la importación: ' + err.message });
    }
});

module.exports = router;`;

fs.writeFileSync(adminRoutePath, adminRouteContent, 'utf8');
console.log("Rewrote admin.js.");

// 6. INITIALIZE DB
console.log("Rebuilding DB and Admin...");
try {
    process.chdir(path.join(__dirname, 'server'));
    execSync('node rebuild_db.js', { stdio: 'inherit' });
    execSync('node reset_admin.js', { stdio: 'inherit' });
} catch (e) {
    console.error("Initialization Failed:", e.message);
    process.exit(1);
}

console.log("=== EXPERT FIX COMPLETE ===");
