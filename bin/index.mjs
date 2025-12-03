#!/usr/bin/env node

// eslint-config-install: ESLint / Prettier 템플릿을 현재 프로젝트에 적용하는 CLI입니다.
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function printHelp() {
  console.log(`
eslint-config-install

사용법:
  npx eslint-config-install --type [react|next] --template [flat-config|eslintrc] [--on-exists skip|keep|overwrite]

옵션:
  --type      설정 종류 (react, next)
  --template  템플릿 스타일 (flat-config = eslint.config.mjs, eslintrc = .eslintrc.json)
  --on-exists 기존 설정 파일(.eslintrc, eslint.config, prettier 등) 처리 방식
              (skip = 건너뛰기, keep = 기존 유지 및 새파일 생성, overwrite = 덮어쓰기, 기본값: overwrite)

예시:
  npx eslint-config-install --type react --template flat-config
  npx eslint-config-install --type next --template flat-config
  npx eslint-config-install --type next --template eslintrc
`.trim());
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--type") {
      args.type = argv[++i];
    } else if (arg === "--template") {
      args.template = argv[++i];
    } else if (arg === "--on-exists") {
      args.onExists = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

/**
 * 선택된 템플릿(react/next + flat-config/eslintrc)의 파일을
 * 현재 작업 디렉터리로 복사합니다.
 *
 * 주의
 * - package.json은 여기서 직접 복사하지 않고, mergePackageJson에서 devDependencies만 병합
 * - onExists 옵션으로 기존 파일이 있을 때의 동작(skip/keep/overwrite)을 제어
 */
async function copyTemplate({ type, template, onExists }) {
  const normalizedType = type || "next";
  const normalizedTemplate = template || "flat-config";
  const normalizedOnExists = onExists || "overwrite"; 

  const validTypes = ["react", "next"];
  const validTemplates = ["flat-config", "eslintrc"];
  const validOnExists = ["skip", "keep", "overwrite"];

  if (
    !validTypes.includes(normalizedType) ||
    !validTemplates.includes(normalizedTemplate) ||
    !validOnExists.includes(normalizedOnExists)
  ) {
    console.error("[eslint-config] 잘못된 옵션입니다.\n");
    printHelp();
    process.exit(1);
  }

  const templateStyleDir = normalizedTemplate === "eslintrc" ? "eslintrc" : "flat-config";
  const templateDir = path.join(__dirname, "..", "templates", templateStyleDir, normalizedType);

  if (!fs.existsSync(templateDir)) {
    console.error(
      `[eslint-config] 템플릿을 찾을 수 없습니다: ${templateDir}`
    );
    process.exit(1);
  }

  const files = fs.readdirSync(templateDir);

  for (const file of files) {
    // package.json, prettier.config.cjs, .eslintrc.cjs, .prettierrc.cjs 는
    // 여기서 직접 복사하지 않고, 아래 전용 빌더에서 처리한다.
    if (
      file === "package.json" ||
      file === "prettier.config.cjs" ||
      file === ".eslintrc.cjs" ||
      file === ".prettierrc.cjs"
    ) {
      continue;
    }

    const src = path.join(templateDir, file);
    const dest = path.join(process.cwd(), file);

    if (fs.existsSync(dest)) {
      if (normalizedOnExists === "overwrite") {
        fs.copyFileSync(src, dest);
        console.log(`[eslint-config] 기존 설정 파일을 교체합니다: ${file}`);
      } else if (normalizedOnExists === "keep") {
        const baseDir = fs.existsSync(path.join(process.cwd(), "src"))
          ? path.join(process.cwd(), "src")
          : process.cwd();
        const configDir = path.join(baseDir, "config");
        const configPath = path.join(configDir, file);
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.copyFileSync(src, configPath);
        console.log(
          `[eslint-config] 설정 파일을 생성합니다: config/${file}`
        );
      } else {
        console.log(
          `[eslint-config] 이미 존재하는 설정 파일로 생성을 건너뜁니다: ${file}`
        );
      }
      continue;
    }

    fs.copyFileSync(src, dest);
    console.log(`[eslint-config] 설정 파일을 생성합니다: ${file}`);
  }

  // 실행 순서: ESLint -> Prettier -> package.json -> VS Code
  await buildEslintConfig(templateStyleDir, normalizedType, normalizedOnExists);
  buildPrettierConfig(templateStyleDir, normalizedType, normalizedOnExists);
  mergePackageJson(templateDir);
  ensureVscodeSettings();
  ensureVscodeExtensions();
}

function isLooselySameVersion(a, b) {
  if (a === b) return true;

  // '^5' vs '^5.0.0' 같은 경우를 같은 버전대로 취급
  const stripTrailingZeroMinor = (v) => v.replace(/\.0+(\D|$)/g, "$1");
  if (stripTrailingZeroMinor(a) === stripTrailingZeroMinor(b)) return true;

  // 둘 다 ^ 로 시작하고 major 버전이 같으면 같은 버전 계열로 본다.
  if (a.startsWith("^") && b.startsWith("^")) {
    const majorA = a.slice(1).split(".")[0];
    const majorB = b.slice(1).split(".")[0];
    if (majorA === majorB) return true;
  }

  return false;
}

function mergePackageJson(templateDir) {
  const templatePkgPath = path.join(templateDir, "package.json");
  if (!fs.existsSync(templatePkgPath)) {
    return;
  }

  const userPkgPath = path.join(process.cwd(), "package.json");
  let userPkg = {};

  if (fs.existsSync(userPkgPath)) {
    try {
      const raw = fs.readFileSync(userPkgPath, "utf8");
      userPkg = JSON.parse(raw);
    } catch (error) {
      console.error(
        "[eslint-config] package.json을 읽는 중 오류가 발생했습니다."
      );
      return;
    }
  }

  let templatePkg;
  try {
    const rawTemplate = fs.readFileSync(templatePkgPath, "utf8");
    templatePkg = JSON.parse(rawTemplate);
  } catch (error) {
    console.error(
      "[eslint-config] package.json을 읽는 중 오류가 발생했습니다."
    );
    return;
  }

  const templateDevDeps = templatePkg.devDependencies || {};
  const userDevDeps = userPkg.devDependencies || {};
  const conflicts = [];

  for (const [name, version] of Object.entries(templateDevDeps)) {
    if (userDevDeps[name] && !isLooselySameVersion(userDevDeps[name], version)) {
      conflicts.push({
        name,
        current: userDevDeps[name],
        template: version
      });
      // 항상 사용자의 버전을 우선시하고, 템플릿 버전은 참고용으로만 출력
      continue;
    }

    if (!userDevDeps[name]) {
      userDevDeps[name] = version;
    }
  }

  userPkg.devDependencies = userDevDeps;

  try {
    fs.writeFileSync(userPkgPath, JSON.stringify(userPkg, null, 2) + "\n", "utf8");
    console.log(
      "[eslint-config] 설정 파일을 병합합니다: package.json"
    );

    if (conflicts.length > 0) {
      console.log(
        "[eslint-config] 버전이 다른 패키지가 있어 현재 버전을 유지했습니다 (참고용):"
      );
      for (const conflict of conflicts) {
        console.log(
          `  - ${conflict.name}: 현재 버전=${conflict.current}, 템플릿 버전=${conflict.template}`
        );
      }
    }
  } catch (error) {
    console.error(
      "[eslint-config] package.json을 기록하는 중 오류가 발생했습니다."
    );
  }
}

function ensureVscodeSettings() {
  try {
    const vscodeDir = path.join(process.cwd(), ".vscode");
    const settingsPath = path.join(vscodeDir, "settings.json");

    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
      console.log("[eslint-config] .vscode 디렉터리가 생성되었습니다.");
    }

    let currentSettings = {};

    if (fs.existsSync(settingsPath)) {
      try {
        const raw = fs.readFileSync(settingsPath, "utf8").trim();
        if (raw) {
          currentSettings = JSON.parse(raw);
        }
      } catch (error) {
        console.warn(
          "[eslint-config] 기존 .vscode/settings.json을 파싱할 수 없어 새로 작성합니다."
        );
        currentSettings = {};
      }
    }

    const templateSettingsPath = path.join(
      __dirname,
      "..",
      "templates",
      ".vscode",
      "settings.json"
    );
    let templateSettings = {
      "editor.formatOnSave": true,
      "editor.defaultFormatter": "dbaeumer.vscode-eslint"
    };

    if (fs.existsSync(templateSettingsPath)) {
      try {
        const rawTemplate = fs.readFileSync(templateSettingsPath, "utf8").trim();
        if (rawTemplate) {
          templateSettings = JSON.parse(rawTemplate);
        }
      } catch {
      }
    }

    const mergedSettings = { ...currentSettings };
    for (const [key, value] of Object.entries(templateSettings)) {
      if (mergedSettings[key] === undefined) {
        mergedSettings[key] = value;
      }
    }

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2) + "\n", "utf8");
    console.log(
      "[eslint-config] 설정 파일을 병합합니다: .vscode/settings.json"
    );
  } catch (error) {
    console.error(
      "[eslint-config] .vscode/settings.json을 설정하는 중 오류가 발생했습니다.",
      error
    );
  }
}

function ensureVscodeExtensions() {
  try {
    const vscodeDir = path.join(process.cwd(), ".vscode");
    const extensionsPath = path.join(vscodeDir, "extensions.json");

    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
      console.log("[eslint-config] .vscode 디렉터리가 생성되었습니다.");
    }

    let currentExtensions = {};

    if (fs.existsSync(extensionsPath)) {
      try {
        const raw = fs.readFileSync(extensionsPath, "utf8").trim();
        if (raw) {
          currentExtensions = JSON.parse(raw);
        }
      } catch (error) {
        console.warn(
          "[eslint-config] 기존 .vscode/extensions.json을 파싱할 수 없어 새로 작성합니다."
        );
        currentExtensions = {};
      }
    }

    const templateExtensionsPath = path.join(
      __dirname,
      "..",
      "templates",
      ".vscode",
      "extensions.json"
    );

    let templateExtensions = {
      recommendations: [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "streetsidesoftware.code-spell-checker"
      ],
      unwantedRecommendations: []
    };

    if (fs.existsSync(templateExtensionsPath)) {
      try {
        const rawTemplate = fs.readFileSync(templateExtensionsPath, "utf8").trim();
        if (rawTemplate) {
          templateExtensions = JSON.parse(rawTemplate);
        }
      } catch {
      }
    }

    const currentRecs = currentExtensions.recommendations || [];
    const currentUnwanted = currentExtensions.unwantedRecommendations || [];
    const templateRecs = templateExtensions.recommendations || [];
    const templateUnwanted = templateExtensions.unwantedRecommendations || [];

    const merged = {
      ...currentExtensions,
      recommendations: Array.from(new Set([...currentRecs, ...templateRecs])),
      unwantedRecommendations: Array.from(new Set([...currentUnwanted, ...templateUnwanted]))
    };

    fs.writeFileSync(extensionsPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
    console.log(
      "[eslint-config] 설정 파일을 병합합니다: .vscode/extensions.json"
    );
  } catch (error) {
    console.error(
      "[eslint-config] .vscode/extensions.json을 설정하는 중 오류가 발생했습니다.",
      error
    );
  }
}

function buildPrettierConfig(templateStyleDir, type, onExists) {
  try {
    // eslintrc 템플릿에서는 .prettierrc 파일을 그대로 복사하므로
    // 별도의 빌드 과정이 필요하지 않다.
    if (templateStyleDir !== "flat-config") {
      return;
    }

    const templatePrettierName = "prettier.config.cjs";

    const typePath = path.join(
      __dirname,
      "..",
      "templates",
      templateStyleDir,
      type,
      templatePrettierName
    );

    if (!fs.existsSync(typePath)) {
      console.warn(
        "[eslint-config] prettier 타입 템플릿을 찾을 수 없어 prettier.config.cjs 생성을 건너뜁니다."
      );
      return;
    }

    const finalConfig = require(typePath); // flat-config 템플릿에서 base를 require/import 해서 병합한 결과

    const rootName = "prettier.config.cjs";
    const rootPath = path.join(process.cwd(), rootName);
    let targetPath = rootPath;

    if (onExists === "skip" && fs.existsSync(rootPath)) {
      return;
    }

    if (onExists === "keep" && fs.existsSync(rootPath)) {
      const baseDir = fs.existsSync(path.join(process.cwd(), "src"))
        ? path.join(process.cwd(), "src")
        : process.cwd();
      const configDir = path.join(baseDir, "config");
      fs.mkdirSync(configDir, { recursive: true });
      targetPath = path.join(configDir, rootName);
    }

    const fileContent =
      "module.exports = " +
      JSON.stringify(finalConfig, null, 2) +
      ";\n";

    fs.writeFileSync(targetPath, fileContent, "utf8");
    console.log(
      `[eslint-config] 설정 파일을 생성합니다: ${path.relative(process.cwd(), targetPath)}`
    );
  } catch (error) {
    console.error(
      "[eslint-config] prettier.config.cjs를 생성하는 중 오류가 발생했습니다.",
      error
    );
  }
}

async function buildEslintConfig(templateStyleDir, type, onExists) {
  try {
    // 현재는 flat-config / eslintrc 모두 템플릿 파일을 그대로 복사하는 방식으로 동작하므로
    // 별도의 ESLint 설정 빌드 로직은 사용하지 않는다.
    return;
  } catch (error) {
    console.error(
      "[eslint-config] ESLint 설정 파일을 생성하는 중 오류가 발생했습니다.",
      error
    );
  }
}

async function askOnExistsIfNeeded(onExistsArg) {
  const validOnExists = ["skip", "keep", "overwrite"];

  if (onExistsArg && validOnExists.includes(onExistsArg)) {
    return onExistsArg;
  }

  // 터미널이 아니면 자동으로 overwrite 사용 (CI 등 비대화형 환경)
  if (!process.stdin.isTTY) {
    return "overwrite";
  }

  return await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const message =
      "\n[eslint-config] 이미 존재하는 설정 파일(.eslintrc, eslint.config, prettier 등)이 있을 때의 동작을 선택하세요.\n" +
      "  [s] skip      - 중복 설정 파일은 건너뜀\n" +
      "  [k] keep      - 기존 설정 파일은 그대로 두고, 새로운 설정 파일 생성\n" +
      "  [o] overwrite - (추천) 기존 설정 파일을 덮어씀\n" +
      "선택 (s/k/o) [o]: ";

    rl.question(message, (answer) => {
      rl.close();
      const a = (answer || "").trim().toLowerCase();
      if (a === "s" || a === "skip") return resolve("skip");
      if (a === "k" || a === "keep") return resolve("keep");
      if (a === "o" || a === "overwrite") return resolve("overwrite");
      // 기본값: overwrite
      return resolve("overwrite");
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const onExists = await askOnExistsIfNeeded(args.onExists);

  copyTemplate({
    type: args.type,
    template: args.template,
    onExists
  });
}

main().catch((error) => {
  console.error("[eslint-config] 실행 중 오류가 발생했습니다.", error);
  process.exit(1);
});


