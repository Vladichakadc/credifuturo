const fs = require('fs');
const path = require('path');

const userDir = path.join('c:', 'Credifuturo', 'Credifuturo-Web', 'client', 'src', 'pages', 'user');
const files = fs.readdirSync(userDir).filter(f => f.endsWith('.jsx'));

for (let file of files) {
    const filePath = path.join(userDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('</</h1>>')) {
        content = content.replace(/<\/<\/h1>>/g, '</h1>'); // In case it got doubled differently
        content = content.replace(/<\/(<h1.*?>.*?<\/h1>)>/g, '$1');
        content = content.replace(/<\/<\/h1>>/g, '</h1>');
        content = content.split('</</h1>>').join('</h1>');
        fs.writeFileSync(filePath, content);
        console.log('Fixed ' + file);
    }
    if (content.includes('</</h2>>')) {
        content = content.split('</</h2>>').join('</h2>');
        fs.writeFileSync(filePath, content);
        console.log('Fixed ' + file);
    }
}
