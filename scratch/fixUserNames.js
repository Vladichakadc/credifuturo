const fs = require('fs');
const path = require('path');

const userDir = path.join('c:', 'Credifuturo', 'Credifuturo-Web', 'client', 'src', 'pages', 'user');
const files = fs.readdirSync(userDir).filter(f => f.endsWith('.jsx'));

for (let file of files) {
    const filePath = path.join(userDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('user.nombre') || content.includes('user.apellido')) {
        content = content.replace(/user\?\.nombre/g, 'user?.name');
        content = content.replace(/user\.nombre/g, 'user.name');
        content = content.replace(/user\.apellido/g, 'user.surname1');
        fs.writeFileSync(filePath, content);
        console.log('Fixed ' + file);
    }
}

// And also fix SavingsSummaryPage.jsx
const adminSavings = 'c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/SavingsSummaryPage.jsx';
let contentSavings = fs.readFileSync(adminSavings, 'utf8');
if (contentSavings.includes('user.nombre') || contentSavings.includes('user.apellido')) {
    contentSavings = contentSavings.replace(/user\?\.nombre/g, 'user?.name');
    contentSavings = contentSavings.replace(/user\.nombre/g, 'user.name');
    contentSavings = contentSavings.replace(/user\.apellido/g, 'user.surname1');
    fs.writeFileSync(adminSavings, contentSavings);
    console.log('Fixed SavingsSummaryPage.jsx');
}

// And DashboardHome.jsx
const dashboardHome = 'c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/DashboardHome.jsx';
let contentDashboard = fs.readFileSync(dashboardHome, 'utf8');
if (contentDashboard.includes('user.nombre') || contentDashboard.includes('user.apellido')) {
    contentDashboard = contentDashboard.replace(/user\?\.nombre/g, 'user?.name');
    contentDashboard = contentDashboard.replace(/user\.nombre/g, 'user.name');
    contentDashboard = contentDashboard.replace(/user\.apellido/g, 'user.surname1');
    fs.writeFileSync(dashboardHome, contentDashboard);
    console.log('Fixed DashboardHome.jsx');
}

