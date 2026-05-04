const fs = require('fs');

function fixContent(file) {
  let content = fs.readFileSync(file, 'utf8');

  // Fix strings like \`\${step.timestamp}s\` to `${step.timestamp}s`
  // We can just find all instances of \` and replace with `
  // and \${ with ${
  content = content.replace(/\\\`/g, '`');
  content = content.replace(/\\\${/g, '${');

  // However, FIXED_FORMAT_PROMPT has: （如 ```json）。
  // This would have been unescaped to actual backticks, which would close the template string.
  // Let's re-escape them.
  content = content.replace(/（如 ```json）。/g, '（如 \\`\\`\\`json）。');

  fs.writeFileSync(file, content);
  console.log('Fixed', file);
}

fixContent('index.html');
fixContent('App.jsx');
