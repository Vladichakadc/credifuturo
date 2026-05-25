const fs = require('fs');
const path = require('path');

const userDir = path.join('c:', 'Credifuturo', 'Credifuturo-Web', 'client', 'src', 'pages', 'user');
const files = fs.readdirSync(userDir).filter(f => f.endsWith('.jsx'));

for (let file of files) {
    const filePath = path.join(userDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes("user.surname1 || ''}")) {
        content = content.replace(/user\.surname1 \|\| ''}/g, "user.surname1 || ''} ${user.surname2 || ''}");
        fs.writeFileSync(filePath, content);
        console.log('Fixed ' + file);
    }
}

// And also fix SavingsSummaryPage.jsx
const adminSavings = 'c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/SavingsSummaryPage.jsx';
let contentSavings = fs.readFileSync(adminSavings, 'utf8');
if (contentSavings.includes("user.surname1 || ''}")) {
    contentSavings = contentSavings.replace(/user\.surname1 \|\| ''}/g, "user.surname1 || ''} ${user.surname2 || ''}");
    fs.writeFileSync(adminSavings, contentSavings);
    console.log('Fixed SavingsSummaryPage.jsx');
}

// And DashboardHome.jsx
const dashboardHome = 'c:/Credifuturo/Credifuturo-Web/client/src/pages/admin/DashboardHome.jsx';
let contentDashboard = fs.readFileSync(dashboardHome, 'utf8');
if (contentDashboard.includes("user.surname1 || ''}")) {
    contentDashboard = contentDashboard.replace(/user\.surname1 \|\| ''}/g, "user.surname1 || ''} ${user.surname2 || ''}");
    fs.writeFileSync(dashboardHome, contentDashboard);
    console.log('Fixed DashboardHome.jsx');
}

