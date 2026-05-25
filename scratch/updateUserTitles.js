const fs = require('fs');
const path = require('path');

const userDir = path.join('c:', 'Credifuturo', 'Credifuturo-Web', 'client', 'src', 'pages', 'user');

const filesToUpdate = [
    { file: 'UserAccountDetailsPage.jsx', comp: 'const UserAccountDetailsPage = () => {', titleMatch: /<h1 className="text-2xl font-bold text-brand-primary">Detalle de la Cuenta<\/h1>/ },
    { file: 'UserContributionsListPage.jsx', comp: 'const UserContributionsListPage = () => {', titleMatch: /<h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">[\s\S]*?<\/h2>/ },
    { file: 'UserLoanAnalyzerPage.jsx', comp: 'const UserLoanAnalyzerPage = () => {', titleMatch: /<h1 className="text-2xl font-bold text-brand-primary flex items-center gap-2">[\s\S]*?<\/h1>/ },
    { file: 'UserLoansListPage.jsx', comp: 'const UserLoansListPage = () => {', titleMatch: /<h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">[\s\S]*?<\/h2>/ },
    { file: 'UserPaymentsListPage.jsx', comp: 'const UserPaymentsListPage = () => {', titleMatch: /<h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">[\s\S]*?<\/h2>/ },
    { file: 'UserResolutionsPage.jsx', comp: 'const UserResolutionsPage = () => {', titleMatch: /<h1 className="text-xl font-bold text-gray-900">Resoluciones y Acuerdos 2025-2026<\/h1>/ },
    { file: 'UserSavingsListPage.jsx', comp: 'const UserSavingsListPage = () => {', titleMatch: /<h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">[\s\S]*?<\/h2>/ },
    { file: 'UserStatutesPage.jsx', comp: 'const UserStatutesPage = () => {', titleMatch: /<h1 className="text-xl font-bold text-gray-900">Estatutos del Fondo Familiar<\/h1>/ }
];

const userInjectCode = `
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch { return {}; }
    })();
`;

for (let item of filesToUpdate) {
    const filePath = path.join(userDir, item.file);
    if (!fs.existsSync(filePath)) continue;
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Inject user code if not present
    if (!content.includes("JSON.parse(localStorage.getItem('user')")) {
        content = content.replace(item.comp, item.comp + userInjectCode);
    }
    
    // Update title
    const match = content.match(item.titleMatch);
    if (match) {
        let originalTitle = match[0];
        if (!originalTitle.includes("{!user?.nombre")) {
            let newTitle = originalTitle.replace(/<\/h[12]>/, ` {!user?.nombre ? '' : \`- \${user.nombre} \${user.apellido || ''}\`.trim()}</$&>`);
            // replace <//h1> with </h1>
            newTitle = newTitle.replace(/<\/h[12]><\/h[12]>/, (m) => m.substring(0, 5));
            content = content.replace(item.titleMatch, newTitle);
        }
    }
    
    fs.writeFileSync(filePath, content);
    console.log('Updated ' + item.file);
}
