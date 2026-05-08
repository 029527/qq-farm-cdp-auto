#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");
const inputPath = path.join(projectRoot, "button.js");
const outputPath = path.join(projectRoot, "button-lite.js");

function findFunctionRange(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("\\r?\\n  (async\\s+)?function\\s+" + escaped + "\\s*\\(");
  const match = re.exec(source);
  if (!match) throw new Error(`function not found: ${name}`);

  const start = match.index + (source[match.index] === "\r" ? 2 : 1);
  const brace = source.indexOf("{", start);
  if (brace < 0) throw new Error(`function body not found: ${name}`);

  let depth = 0;
  let quote = null;
  let escapedChar = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escapedChar) {
        escapedChar = false;
        continue;
      }
      if (ch === "\\") {
        escapedChar = true;
        continue;
      }
      if (quote === "`" && ch === "$" && next === "{") {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return [start, i + 1];
    }
  }

  throw new Error(`function body end not found: ${name}`);
}

function replaceFunction(source, name, replacement) {
  const [start, end] = findFunctionRange(source, name);
  return source.slice(0, start) + replacement + source.slice(end);
}

function makeDisabledFunction(name, isAsync = false) {
  return `  ${isAsync ? "async " : ""}function ${name}(opts) {\n    return liteDisabled('${name}', opts);\n  }`;
}

function insertLiteDisabledHelper(source) {
  if (source.includes("function liteDisabled(")) return source;
  const [, end] = findFunctionRange(source, "out");
  const helper = [
    "",
    "",
    "  function liteDisabled(action, opts) {",
    "    const payload = { action: action, disabled: true, reason: 'lite_bundle' };",
    "    return opts && opts.silent ? payload : out(payload);",
    "  }",
  ].join("\n");
  return source.slice(0, end) + helper + source.slice(end);
}

function shrinkReadyApiList(source) {
  const start = source.indexOf("    api: [");
  if (start < 0) return source;
  const arrayStart = source.indexOf("[", start);
  if (arrayStart < 0) return source;

  let depth = 0;
  let quote = null;
  let escapedChar = false;
  let arrayEnd = -1;
  for (let i = arrayStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escapedChar) {
        escapedChar = false;
        continue;
      }
      if (ch === "\\") {
        escapedChar = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
  }
  if (arrayEnd < 0) return source;

  const api = [
    "    api: [",
    "      'gameCtl.getFarmStatus()',",
    "      'gameCtl.triggerOneClickOperation(typeOrIndex, opts)',",
    "      'gameCtl.enterOwnFarm(opts)',",
    "      'gameCtl.enterFriendFarm(target, opts)',",
    "      'gameCtl.getFriendList(opts)',",
    "      'gameCtl.autoPlant(opts)',",
    "      'gameCtl.fertilizeLand(opts)',",
    "      'gameCtl.refreshWarehouseSnapshot(opts)',",
    "      'gameCtl.sellWarehouseItems(opts)',",
    "      'gameCtl.autoReconnectIfNeeded(opts)'",
    "    ]",
  ].join("\n");
  return source.slice(0, start) + api + source.slice(arrayEnd);
}

function buildLiteSource(source) {
  let next = insertLiteDisabledHelper(source);

  const syncDisabled = [
    "dumpButtons",
    "inspectFarmModelRuntime",
    "inspectMainUiRuntime",
    "inspectFarmComponentCandidates",
    "getPlayerProfileDebug",
    "scanAccountRuntimeDebug",
    "scanSystemAccountCandidates",
    "ensureInteractionManagerSpyRetry",
    "installInteractionManagerSpies",
    "getRuntimeSpySnapshot",
    "startRuntimeSpies",
    "resetRuntimeSpyEvents",
    "installRuntimeSendSpies",
    "installRuntimeSpies",
    "inspectWarehouseProtocolCandidates",
    "inspectWarehouseControllerRuntime",
    "inspectWarehouseDataSource",
    "inspectMessageBusListeners",
    "inspectProtocolTransport",
    "inspectRecentClickTrace",
    "inspectRewardPopupTextMatches",
    "inspectRewardPopupTarget",
    "inspectOneClickToolNodes",
    "farmNodes",
    "guessFarmCandidates",
    "dumpFarmNodes",
    "dumpFarmCandidates",
    "snapshotNode",
    "diffSnapshots",
  ];
  for (const name of syncDisabled) {
    next = replaceFunction(next, name, makeDisabledFunction(name));
  }

  const asyncDisabled = [
    "captureWarehouseProtocol",
    "inspectShopUi",
    "inspectShopModelRuntime",
    "openLandAndDiffButtons",
    "inspectLandDetail",
    "inspectFertilizerRuntime",
    "tapAndSnapshot",
    "batchTap",
    "tapFarmCandidates",
  ];
  for (const name of asyncDisabled) {
    next = replaceFunction(next, name, makeDisabledFunction(name, true));
  }

  const profileLite = [
    "  function getPlayerProfile(opts) {",
    "    opts = opts || {};",
    "    const farmModel = safeCall(function () { return getFarmModel(opts); }, null);",
    "    const currentUser = farmModel && (safeReadKey(farmModel, 'curUserModel') || safeReadKey(farmModel, 'userModel') || safeReadKey(farmModel, 'selfModel'));",
    "    function pick(keys) {",
    "      for (let i = 0; i < keys.length; i += 1) {",
    "        const value = currentUser ? safeReadKey(currentUser, keys[i]) : null;",
    "        if (value != null && value !== '') return value;",
    "      }",
    "      return null;",
    "    }",
    "    const profile = {",
    "      gid: getSelfGid(),",
    "      playerId: pick(['playerId', 'player_id', 'roleId', 'uid']),",
    "      name: pick(['name', 'limitName', 'nick', 'nickname', 'role_name']),",
    "      level: pick(['level', 'lv', 'grade', 'role_level']),",
    "      plantLevel: pick(['plantLevel', 'maxPlantLevel', 'farmMaxLandLevel', 'maxLandLevel']),",
    "      exp: pick(['exp', 'curExp', 'currentExp']),",
    "      nextLevelExp: pick(['nextLevelExp', 'maxExp', 'next_exp', 'needExp', 'targetExp']),",
    "      gold: pick(['gold', 'coin', 'coins', 'money']),",
    "      coupon: pick(['coupon', 'couponNum', 'coupons', 'ticket']),",
    "      diamond: pick(['diamond', 'diamonds', 'gem']),",
    "      bean: pick(['bean', 'beans', 'goldBean']),",
    "      source: 'lite_runtime'",
    "    };",
    "    return opts.silent ? profile : out(profile);",
    "  }",
  ].join("\n");
  next = replaceFunction(next, "getPlayerProfile", profileLite);

  return shrinkReadyApiList(next);
}

function run() {
  const source = fs.readFileSync(inputPath, "utf8");
  const liteSource = buildLiteSource(source);
  const tempPath = path.join(os.tmpdir(), `button-lite-${process.pid}.js`);
  fs.writeFileSync(tempPath, liteSource, "utf8");
  try {
    const args = ["--yes", "terser", tempPath, "-c", "passes=3", "-m", "toplevel=true", "-o", outputPath];
    if (process.platform === "win32") {
      execFileSync("cmd.exe", ["/d", "/c", "npx", ...args], { cwd: projectRoot, stdio: "inherit" });
    } else {
      execFileSync("npx", args, { cwd: projectRoot, stdio: "inherit" });
    }
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (_) {}
  }

  const bytes = fs.statSync(outputPath).size;
  if (bytes > 200_000) {
    throw new Error(`button-lite.js is ${bytes} bytes, expected <= 200000 bytes`);
  }
  console.log(`[button-lite] generated ${path.relative(projectRoot, outputPath)} (${bytes} bytes)`);
}

run();
