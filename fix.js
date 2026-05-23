import fs from 'fs';
['main.js', 'pipeline.js'].forEach(f => {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/\\\`/g, '\`').replace(/\\\$/g, '$');
  fs.writeFileSync(f, s);
});
