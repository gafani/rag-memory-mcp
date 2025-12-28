const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'src', 'dashboard.html');
const distPath = path.join(__dirname, '..', 'dist', 'dashboard.html');

// dist 디렉토리가 없으면 생성
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// HTML 파일 복사
fs.copyFileSync(srcPath, distPath);
console.log('✓ Copied dashboard.html to dist/');
