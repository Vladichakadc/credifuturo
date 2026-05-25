const fs = require('fs');
const file = 'c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/SavingsSummaryPage.jsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = "const SavingsSummaryPage = ({ lockedSocio = null, hideControls = false, preloadedData = null }) => {\\n    const { toast, navigate } = useUi();\\n    const location = useLocation();";
const replace1 = target1 + "\\n    const user = (() => {\\n        try { return JSON.parse(localStorage.getItem('user') || '{}'); }\\n        catch { return {}; }\\n    })();";
content = content.replace(target1, replace1);

const target2 = '<h1 className="text-xl font-black text-gray-900 leading-none">Detalle de la Cuenta</h1>';
const replace2 = '<h1 className="text-xl font-black text-gray-900 leading-none">Detalle de la Cuenta {!lockedSocio && user?.nombre ? `- ${user.nombre} ${user.apellido || \'\'}`.trim() : (lockedSocio && lockedSocio.name ? `- ${lockedSocio.name}` : \'\')}</h1>';
content = content.replace(target2, replace2);

fs.writeFileSync(file, content);
console.log('Fixed SavingsSummaryPage.jsx');
