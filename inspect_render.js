const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

// Find render() function in index.html
const renderIdx = indexHtml.indexOf('function render()');
console.log('render() function:');
console.log(indexHtml.slice(renderIdx, renderIdx + 1500));
