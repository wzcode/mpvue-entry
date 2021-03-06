const fs = require('fs');
const path = require('path');
const { writeFile, removeFile } = require('./file');
const { isConfigChanged } = require('./equal');

let oldPages = [];
let template = '';

/**
 * @param {Object} page
 * @param {Object} paths
 * @param {String} paths.entry - The path of the entry.
 */
function parsePath(page, paths) {
  const pagePath = page.path.replace(/^\//, '');
  const fileName = pagePath.replace(/\/(\w)/g, (match, $1) => $1.toUpperCase());
  const entryPath = path.join(paths.entry, `${fileName}.js`);

  return { pagePath, entryPath };
}

/**
 * @param {Object} paths
 * @param {String} [cause=initial]
 */
function genEntry(paths, cause = 'initial') {
  const entry = { app: paths.template };

  if (cause !== 'pages') {
    const mixinReg = /Vue\.mixin(.*).*/;
    template = fs.readFileSync(paths.template).toString()
      .replace(/.*mpType.*/, '')
      .replace(/.*app-only-begin[^]*?app-only-end.*/g, '')
      .replace(/.*app-only.*/g, '');
    while (mixinReg.test(template)) {
      template = template.replace(mixinReg, '')
        .replace(new RegExp(`import ${RegExp.$1 || null}.*`), '');
    }
    template = template.replace(/[\r?\n]{2,}/g, '\n\n');
  }

  require.cache[paths.pages] = null;
  const pages = require(paths.pages)
    .map(page => typeof page === 'string' ? { path: page } : page);

  const queue = pages.filter(page => !page.native).map((page) => {
    const { pagePath, entryPath } = parsePath(page, paths);
    const pageConfig = JSON.stringify({ config: page.config }, null, '  ');

    entry[pagePath] = entryPath;

    if (cause !== 'pages' || isConfigChanged(page, oldPages)) {
      return writeFile(entryPath, template
        .replace(/import App from .*/, `import App from '@/${pagePath}'`)
        .replace(/export default ?{[^]*}/, `export default ${pageConfig}`));
    }

    return Promise.resolve();
  });

  oldPages.filter(oldPage => !pages.find(page => page.path === oldPage.path))
    .forEach((oldPage) => {
      const { pagePath, entryPath } = parsePath(oldPage, paths);
      const distDir = path.dirname(paths.app);
      const suffixes = ['js', 'json', 'wxml', 'wxss'];

      removeFile(suffixes
        .map(suffix => path.join(distDir, `${pagePath}.${suffix}`))
        .concat(entryPath));
    });

  if (cause !== 'initial') {
    require.cache[paths.app] = null;
    const app = require(paths.app);

    app.pages = pages.map(page => page.path.replace(/^\//, ''));

    fs.writeFileSync(paths.app, JSON.stringify(app, null, '  '));
  }

  oldPages = pages.concat();

  return Promise.all(queue).then(() => entry);
}

module.exports = {
  genEntry,
};
