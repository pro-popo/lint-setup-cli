## eslint-config-install

React / Next.js + TypeScript 환경에서 **ESLint / Prettier / VS Code 설정을 한 번에 세팅해 주는 CLI**입니다.  
템플릿 파일을 복사·병합해서, 바로 사용할 수 있는 설정을 만들어 줍니다.

- **템플릿 스타일**
  - `flat-config`: `eslint.config.mjs` (ESLint 9 Flat Config)
  - `eslintrc`: `.eslintrc.json` (Legacy `.eslintrc` 스타일)
- **프로젝트 타입**
  - `react`
  - `next`
- **VS Code**
  - `.vscode/settings.json`
  - `.vscode/extensions.json`

---

## 설치

패키지 설치:

```bash
npm install -D eslint-config-install
# 또는
yarn add -D eslint-config-install
pnpm add -D eslint-config-install
```

`npx`로 한 번만 실행해도 됩니다:

```bash
npx eslint-config-install --type next --template flat-config
```

---

## 사용법

### 기본 명령

```bash
npx eslint-config-install \
  --type [react|next] \
  --template [flat-config|eslintrc] \
  [--on-exists skip|keep|overwrite]
```

- **`--type`**
  - `react`: React 프로젝트용 규칙
  - `next`: Next.js 프로젝트용 규칙 ( **기본값**)

- **`--template`**
  - `flat-config`: `eslint.config.mjs` (ESLint 9 Flat Config, **기본값**)
  - `eslintrc`: `.eslintrc.json`

- **`--on-exists`** (기존 설정 파일 처리 방식)
  - `overwrite`: 기존 설정 파일을 템플릿 기준으로 교체 (**기본값**)
  - `keep`:
    - 기존 설정 파일을 유지하고,
    - 새 설정 파일은 `src/config/*` 또는 `config/*` 아래에 생성
  - `skip`:
    - 이미 존재하는 설정 파일은 건너뜀

`--on-exists`를 생략하면, TTY 환경에서 설정 옵션이 나타납니다:

```text
[eslint-config] 이미 존재하는 설정 파일(.eslintrc, eslint.config, prettier 등)이 있을 때의 동작을 선택하세요.
  [s] skip      - 중복 설정 파일은 건너뜀
  [k] keep      - 기존 설정 파일은 그대로 두고, 새로운 설정 파일 생성
  [o] overwrite - (추천) 기존 설정 파일을 덮어씀
선택 (s/k/o) [o]:
```

### 예시

```bash
# 1) Flat Config 기반 Next.js
npx eslint-config-install --type next --template flat-config

# 2) Flat Config 기반 React
npx eslint-config-install --type react --template flat-config

# 3) eslintrc(.eslintrc.json) 기반 Next.js
npx eslint-config-install --type next --template eslintrc
```

---

## 생성·병합되는 파일

### 1. ESLint

- **`--template flat-config`**
  - `eslint.config.mjs`

- **`--template eslintrc`**
  - `.eslintrc.json`

### 2. Prettier

- **`--template flat-config`**
  - `prettier.config.cjs`

- **`--template eslintrc`**
  - `.prettierrc`

### 3. `package.json` (devDependencies 병합)

선택한 템플릿 디렉터리의 `package.json`에서 **`devDependencies`만** 읽어서 현재 프로젝트의 `package.json`에 병합합니다.

- 템플릿에만 존재하는 패키지 → `devDependencies`에 추가
- 이미 존재하는 패키지 → 그대로 유지

> 실제 ESLint / Prettier / 플러그인 설치는 이 병합된 `devDependencies` 기준으로  
> `npm install` 또는 `pnpm install` 등을 사용해 직접 진행해야 합니다.

### 4. VS Code 설정

- `.vscode/settings.json`
  - `"editor.formatOnSave": true` → 파일 저장 시 자동으로 코드 포맷
  - `"editor.defaultFormatter": "dbaeumer.vscode-eslint"` → ESLint를 기본 포매터로 사용

- `.vscode/extensions.json`
  - `dbaeumer.vscode-eslint` → ESLint 확장
  - `esbenp.prettier-vscode` → Prettier 포매터 확장
  - `streetsidesoftware.code-spell-checker` → 코드/텍스트 철자 검사 확장

---

## 로컬 개발 / 테스트

- **`npm link`를 이용한 전역 설치 시뮬레이션**
  - 1단계: 패키지 저장소 경로 (eslint-config-install repo):
    ```bash
    npm link
    ```
  - 2단계: 테스트용 프로젝트 경로:
    ```bash
    npm link eslint-config-install
    npx eslint-config-install --type next --template flat-config
    ```
