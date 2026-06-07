const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'context', 'AuthContext.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
const cleanedLines = lines.filter(line => !line.includes('console.log(') && !line.includes('console.warn(') && !line.includes('console.error('));

fs.writeFileSync(filePath, cleanedLines.join('\n'), 'utf8');
console.log('Logs removed from AuthContext.tsx');
