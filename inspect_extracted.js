const fs = require('fs');
let header = fs.readFileSync('temp_extracted_header.html', 'utf8');
header = header.replace(/src="data:image[^"]+"/, 'src="/assets/postsprint-nav-logo.png"');
console.log(header);
