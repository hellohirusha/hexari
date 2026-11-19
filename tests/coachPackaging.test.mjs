import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { cwd, execPath } from "node:process";
import ts from "typescript";
import { expect, it } from "vitest";

it("loads the compiled coach function with its server dependencies", async () => {
  const root = cwd();
  const temp = await mkdtemp(path.join(tmpdir(), "hexari-coach-build-"));
  try {
    const config = ts.readConfigFile(
      path.join(root, "tsconfig.json"),
      ts.sys.readFile,
    );
    const options = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      root,
    ).options;
    const pending = [path.join(root, "api/coach.ts")];
    const visited = new Set();
    while (pending.length) {
      const file = pending.pop();
      if (visited.has(file)) continue;
      visited.add(file);
      const source = await readFile(file, "utf8");
      for (const imported of ts.preProcessFile(source).importedFiles) {
        if (!imported.fileName.startsWith(".")) continue;
        const resolved = ts.resolveModuleName(
          imported.fileName,
          file,
          options,
          ts.sys,
        ).resolvedModule?.resolvedFileName;
        if (!resolved)
          throw new Error(`Could not resolve ${imported.fileName}`);
        pending.push(resolved);
      }
      const output = ts.transpileModule(source, {
        fileName: file,
        compilerOptions: { ...options, noEmit: false },
      }).outputText;
      const target = path.join(
        temp,
        path.relative(root, file).replace(/\.ts$/, ".js"),
      );
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, output);
    }
    await writeFile(path.join(temp, "package.json"), '{"type":"module"}');
    const entry = pathToFileURL(path.join(temp, "api/coach.js")).href;
    const script = `
      const { default: handler } = await import(${JSON.stringify(entry)});
      const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
      await handler({ method: "GET" }, response);
      process.stdout.write(JSON.stringify({ code: response.code, body: response.body }));
    `;
    const result = spawnSync(execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      timeout: 10000,
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      code: 405,
      body: { error: "Use POST." },
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
