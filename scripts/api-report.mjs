#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
/**
 * API report: writes the public surface of every package under packages/ to
 * packages/<name>/api-report.md, one section per export-map entry with every exported name and
 * its signature. A change to the surface then shows up as a diff of that file in review.
 *
 * The entries are the ones an npm consumer can import: the published export map
 * (`publishConfig.exports`, else `exports`), its dist targets mapped back to their source through
 * the outDir/rootDir of tsconfig.build.json. A wildcard (`./*`) is expanded over the files that
 * config compiles into dist, so tests and fixtures stay out as in the published package.
 * Stylesheet entries are listed without symbols.
 *
 * Usage:
 *   node scripts/api-report.mjs            rewrite the reports
 *   node scripts/api-report.mjs --check    compare with the committed reports and print what
 *                                          changed; reports only, always exits 0 (CI annotates
 *                                          the drift as a warning and in the step summary)
 *
 * Needs node_modules (the signatures come from the TypeScript checker).
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = 'api-report.md';
// A signature longer than this is cut and stamped with a hash of the full text, so the report
// stays readable while any change to the cut part still changes the line.
const MAX_LINE = 400;
const FORMAT =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  ts.TypeFormatFlags.WriteArrowStyleSignature;

const posix = (p) => p.split('\\').join('/');

function clip(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= MAX_LINE) return flat;
  const hash = createHash('sha256').update(flat).digest('hex').slice(0, 10);
  return `${flat.slice(0, MAX_LINE)}… [${flat.length} chars, sha256 ${hash}]`;
}

/** The file an export target points at: a string, or the `types`/`import`/`default` leg. */
function targetOf(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.types ?? value.import ?? value.default;
  return undefined;
}

function compiledFiles(pkgDir) {
  const configPath = ['tsconfig.build.json', 'tsconfig.json']
    .map((f) => join(pkgDir, f))
    .find(existsSync);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
  );
  return { options: { ...parsed.options, noEmit: true }, fileNames: parsed.fileNames.map(posix) };
}

const SOURCE_EXT = /\.(d\.ts|[mc]?js|[mc]?tsx?)$/;
const stemOf = (file) => file.replace(SOURCE_EXT, '');

/** Export-map entries of one package as [subpath, absolute source file or null for CSS]. */
function entriesOf(pkgDir, manifest, { options, fileNames }) {
  const outDir = options.outDir && posix(options.outDir);
  const rootDir = options.rootDir && posix(options.rootDir);
  // A dist target names the compiled file; the report needs the source file it came from.
  const sourceStem = (target) => {
    const abs = stemOf(posix(resolve(pkgDir, target)));
    return outDir && rootDir && abs.startsWith(`${outDir}/`)
      ? rootDir + abs.slice(outDir.length)
      : abs;
  };
  const sources = fileNames.filter((f) => !f.endsWith('.d.ts'));
  const entries = [];
  const map = manifest.publishConfig?.exports ?? manifest.exports ?? {};
  for (const [key, value] of Object.entries(map)) {
    const target = targetOf(value);
    if (!target) continue;
    if (target.endsWith('.css')) {
      entries.push([key, null]);
      continue;
    }
    const stem = sourceStem(target);
    if (!key.includes('*')) {
      const file = sources.find((f) => stemOf(f) === stem);
      entries.push([key, file ?? `${stem}.ts`]);
      continue;
    }
    // `./*` → `./dist/*.js`: every compiled file the pattern matches is an entry of its own.
    const [pre, post] = stem.split('*');
    for (const file of sources) {
      const s = stemOf(file);
      if (s.startsWith(pre) && s.endsWith(post))
        entries.push([key.replace('*', s.slice(pre.length, s.length - post.length)), file]);
    }
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

function describe(checker, exported, entryFile) {
  const symbol =
    exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
  const decl = symbol.declarations?.[0];
  const name = exported.name;
  const lines = [];
  const typeOnly = checker.getTypeOnlyAliasDeclaration?.(exported) ? ' (type-only export)' : '';
  if (!decl) return [`${name}: unresolved${typeOnly}`];
  const flags = symbol.flags;
  if (
    flags & ts.SymbolFlags.Module &&
    !(flags & (ts.SymbolFlags.Value & ~ts.SymbolFlags.ValueModule))
  ) {
    lines.push(`namespace ${name}`);
  }
  if (flags & ts.SymbolFlags.Function) {
    const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
    for (const sig of type.getCallSignatures())
      lines.push(clip(`function ${name}${checker.signatureToString(sig, decl, FORMAT)}`));
  } else if (flags & ts.SymbolFlags.Class) {
    lines.push(`class ${name}`);
  } else if (flags & ts.SymbolFlags.Enum) {
    lines.push(
      `enum ${name} { ${checker
        .getExportsOfModule(symbol)
        .map((m) => m.name)
        .join(', ')} }`
    );
  } else if (flags & ts.SymbolFlags.Variable) {
    const kind = ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const ? 'const' : 'let';
    lines.push(
      clip(
        `${kind} ${name}: ${checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol, decl), decl, FORMAT)}`
      )
    );
  }
  if (flags & ts.SymbolFlags.Interface) {
    // Own members and the heritage clause only: a props interface that extends the DOM attributes
    // would otherwise list hundreds of inherited members.
    const decls = symbol.declarations.filter(ts.isInterfaceDeclaration);
    const params = decls[0]?.typeParameters?.length
      ? `<${decls[0].typeParameters.map((p) => p.getText()).join(', ')}>`
      : '';
    const heritage = decls
      .flatMap((d) => d.heritageClauses ?? [])
      .map((h) => h.getText())
      .join(' ');
    lines.push(clip(`interface ${name}${params}${heritage ? ` ${heritage}` : ''} {`));
    for (const member of decls.flatMap((d) => d.members)) {
      const prop = member.symbol;
      if (!prop) {
        lines.push(`  ${clip(member.getText())}`);
        continue;
      }
      if (
        ts.isMethodSignature(member) ||
        ts.isCallSignatureDeclaration(member) ||
        ts.isConstructSignatureDeclaration(member) ||
        ts.isIndexSignatureDeclaration(member)
      ) {
        const sig = checker.getSignatureFromDeclaration(member);
        const label = ts.isMethodSignature(member)
          ? prop.name + (member.questionToken ? '?' : '')
          : '';
        lines.push(
          `  ${clip(sig && !ts.isIndexSignatureDeclaration(member) ? `${label}${checker.signatureToString(sig, member, FORMAT & ~ts.TypeFormatFlags.WriteArrowStyleSignature)}` : member.getText())}`
        );
        continue;
      }
      const optional = prop.flags & ts.SymbolFlags.Optional ? '?' : '';
      const readonly =
        ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Readonly ? 'readonly ' : '';
      lines.push(
        `  ${clip(`${readonly}${prop.name}${optional}: ${checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, member), member, FORMAT)}`)}`
      );
    }
    lines.push('}');
  } else if (flags & ts.SymbolFlags.TypeAlias) {
    const aliasDecl = symbol.declarations.find(ts.isTypeAliasDeclaration);
    const params = aliasDecl?.typeParameters?.length
      ? `<${aliasDecl.typeParameters.map((p) => p.getText()).join(', ')}>`
      : '';
    const body = aliasDecl
      ? checker.typeToString(
          checker.getTypeFromTypeNode(aliasDecl.type),
          aliasDecl,
          FORMAT | ts.TypeFormatFlags.InTypeAlias
        )
      : '?';
    lines.push(clip(`type ${name}${params} = ${body}`));
  }
  if (!lines.length) lines.push(`${name}: ${ts.SymbolFlags[flags] ?? flags}`);
  // Where the declaration lives, when the entry re-exports it from another file.
  const home = posix(decl.getSourceFile().fileName);
  if (home !== entryFile)
    lines[0] += `  // from ${home.includes('/node_modules/') ? home.replace(/.*\/node_modules\//, '') : posix(relative(ROOT, home))}`;
  if (typeOnly) lines[0] += typeOnly;
  return lines;
}

function reportFor(pkgDir) {
  const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  if (!manifest.exports) return null;
  const compiled = compiledFiles(pkgDir);
  const { options } = compiled;
  const entries = entriesOf(pkgDir, manifest, compiled);
  const program = ts.createProgram({
    rootNames: entries.map(([, f]) => f).filter(Boolean),
    options,
  });
  const checker = program.getTypeChecker();

  let names = 0;
  const sections = [];
  for (const [subpath, file] of entries) {
    const specifier = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
    if (!file) {
      sections.push(`## \`${specifier}\`\n\nStylesheet.\n`);
      continue;
    }
    const source = program.getSourceFile(file);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    const exported = moduleSymbol
      ? checker.getExportsOfModule(moduleSymbol).sort((a, b) => a.name.localeCompare(b.name))
      : [];
    names += exported.length;
    const body = exported.flatMap((s) => describe(checker, s, file)).join('\n');
    sections.push(
      `## \`${specifier}\`\n\nSource: \`${posix(relative(pkgDir, file))}\`${exported.length ? '' : ' (no exports)'}\n${exported.length ? `\n\`\`\`ts\n${body}\n\`\`\`\n` : ''}`
    );
  }
  const published = manifest.publishConfig?.exports ?? manifest.exports;
  const unlisted = Object.keys(manifest.exports).filter((k) => k.includes('*')).length
    ? []
    : entries.map(([k]) => k).filter((k) => !(k in manifest.exports));
  const wildcard = Object.keys(published).filter((k) => k.includes('*'));
  const header = [
    `# ${manifest.name}: API report`,
    '',
    '<!-- Generated by scripts/api-report.mjs. Do not edit; run `pnpm api:report`. -->',
    '',
    `Entries: ${entries.length}. Exported names: ${names}.`,
    wildcard.length
      ? `\nThe published export map has the wildcard ${wildcard.map((k) => `\`${k}\``).join(', ')}: every compiled file it matches is an entry.`
      : '',
    unlisted.length
      ? `\nPublished but missing from the development export map (${unlisted.length}): ${unlisted.map((k) => `\`${k}\``).join(', ')}.`
      : '',
    '',
  ];
  return { file: join(pkgDir, REPORT), text: `${header.join('\n')}\n${sections.join('\n')}` };
}

/** Section headings that differ between two reports, as added / removed / changed lists. */
function sectionDiff(before, after) {
  const split = (text) =>
    new Map(
      text
        .split(/^(?=## )/m)
        .slice(1)
        .map((s) => [s.slice(0, s.indexOf('\n')), s])
    );
  const a = split(before);
  const b = split(after);
  const pick = (map, other, pred) =>
    [...map.keys()].filter((k) => pred(k, other)).map((k) => k.slice(3));
  return {
    added: pick(b, a, (k, o) => !o.has(k)),
    removed: pick(a, b, (k, o) => !o.has(k)),
    changed: pick(b, a, (k, o) => o.has(k) && o.get(k) !== b.get(k)),
  };
}

const check = process.argv.includes('--check');
const packagesDir = join(ROOT, 'packages');
const summary = [];
for (const name of readdirSync(packagesDir).sort()) {
  const pkgDir = join(packagesDir, name);
  if (!existsSync(join(pkgDir, 'package.json'))) continue;
  const report = reportFor(pkgDir);
  if (!report) continue;
  const rel = posix(relative(ROOT, report.file));
  if (!check) {
    writeFileSync(report.file, report.text);
    console.log(`wrote ${rel}`);
    continue;
  }
  const committed = existsSync(report.file) ? readFileSync(report.file, 'utf8') : '';
  if (committed === report.text) continue;
  const { added, removed, changed } = sectionDiff(committed, report.text);
  const lines = [`${rel}: the public surface differs from the committed report.`];
  for (const [label, list] of [
    ['added', added],
    ['removed', removed],
    ['changed', changed],
  ])
    if (list.length) lines.push(`  ${label} (${list.length}): ${list.join(', ')}`);
  if (!added.length && !removed.length && !changed.length) lines.push('  (header only)');
  console.log(lines.join('\n'));
  console.log(
    `::warning file=${rel}::API surface changed; run \`pnpm api:report\` and commit the report if the change is intended.`
  );
  summary.push(...lines, '');
}
if (check) {
  if (!summary.length) console.log('API reports are up to date.');
  else if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### API report\n\n\`\`\`\n${summary.join('\n')}\`\`\`\n`
    );
}
