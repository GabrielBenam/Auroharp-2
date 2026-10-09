// Copia el laboratorio web (../autoharp-lab) a app/src/main/assets/web. La app Android lo muestra dentro de un WebView.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', '..', 'autoharp-lab'), dst = path.join(__dirname, '..', 'app/src/main/assets/web');
fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(path.join(dst, 'src'), { recursive: true });
['index.html', 'styles.css'].forEach(f => fs.copyFileSync(path.join(src, f), path.join(dst, f)));
fs.readdirSync(path.join(src, 'src')).forEach(f => fs.copyFileSync(path.join(src, 'src', f), path.join(dst, 'src', f)));
console.log('web copiada:', fs.readdirSync(dst).concat(fs.readdirSync(path.join(dst, 'src')).map(f => 'src/' + f)).join(' '));
