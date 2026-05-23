const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173/');
  
  await page.evaluate(() => {
    localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc5NTA5ODI5LCJleHAiOjE3Nzk1OTYyMjl9.7YFhgBCyQJiFeYGGP-D0GXfmqJ2IOC9ZRXcP_zpslFg');
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'admin', name: 'Admin', email: 'admin@credifuturo.com' }));
  });
  
  await page.goto('http://localhost:5173/admin', {waitUntil: 'networkidle0'});
  
  await new Promise(r => setTimeout(r, 3000));
  
  const html = await page.evaluate(() => document.body.innerText);
  console.log("=== FRONTEND HTML ===\n" + html);
  await browser.close();
})();
