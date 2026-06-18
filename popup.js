// 全局元素
const loadingStatus = document.getElementById('loadingStatus');
const successStatus = document.getElementById('successStatus');
const errorStatus = document.getElementById('errorStatus');
const mainUI = document.getElementById('mainUI');
const filterEmpty = document.getElementById('filterEmpty');

const includeInput = document.getElementById('includeInput');
const excludeInput = document.getElementById('excludeInput');
const excludeInternalCb = document.getElementById('excludeInternalCb');
const internalFilterWrap = document.getElementById('internalFilterWrap');
const dedupCb = document.getElementById('dedupCb');

const continuousCb = document.getElementById('continuousCb');
const clearPoolBtn = document.getElementById('clearPoolBtn');

const tabWeb = document.getElementById('tabWeb');
const tabText = document.getElementById('tabText');
const textModeCard = document.getElementById('textModeCard');
const rawTextInput = document.getElementById('rawTextInput');
const extractTextBtn = document.getElementById('extractTextBtn');
const refreshBtn = document.getElementById('refreshBtn');

const linksList = document.getElementById('linksList');
const copyAllBtn = document.getElementById('copyAllBtn');
const copySuccessToast = document.getElementById('copySuccessToast');
const copyErrorToast = document.getElementById('copyErrorToast');

const toggleAdvanced = document.getElementById('toggleAdvanced');
const advancedContent = document.getElementById('advancedContent');
const regexInput = document.getElementById('regexInput');
const templateInput = document.getElementById('templateInput');
const presetContainer = document.getElementById('presetContainer');
const showAddPresetBtn = document.getElementById('showAddPresetBtn');
const addPresetForm = document.getElementById('addPresetForm');
const savePresetBtn = document.getElementById('savePresetBtn');
const cancelPresetBtn = document.getElementById('cancelPresetBtn');

let rawDataPool = []; 
let currentTab = null;
let currentTabDomain = '';
let currentMode = 'web'; 
let isContinuousMode = false;

// ---- 国际化初始化函数 ----
function localizeUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
    if(msg) el.innerHTML = msg;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n-placeholder'));
    if(msg) el.placeholder = msg;
  });
}

function loadAndRenderPresets() {
  presetContainer.innerHTML = '';
  let customPresets = [];
  try { customPresets = JSON.parse(localStorage.getItem('pudiu_custom_presets') || '[]'); } catch (e) {}

  // 动态加载语言包中的默认预设
  const defaultPresets = [
    { id: 'def_1', name: chrome.i18n.getMessage("presetEmail"), regex: '([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\\.[a-zA-Z0-9_-]+)', template: chrome.i18n.getMessage("presetEmailTpl"), isCustom: false },
    { id: 'def_2', name: chrome.i18n.getMessage("presetPhone"), regex: '(1[3-9]\\d{9}|0\\d{2,3}-\\d{7,8})', template: chrome.i18n.getMessage("presetPhoneTpl"), isCustom: false },
    { id: 'def_3', name: chrome.i18n.getMessage("presetDomain"), regex: '^https?://(?!.*' + currentTabDomain + ')([^/]+)', template: '', isCustom: false },
    { id: 'def_4', name: chrome.i18n.getMessage("presetId"), regex: '[?&]id=([^&#]+)', template: chrome.i18n.getMessage("presetIdTpl"), isCustom: false },
    { id: 'def_5', name: chrome.i18n.getMessage("presetExt"), regex: '\\.([a-zA-Z0-9]+)(?:[?#]|$)', template: chrome.i18n.getMessage("presetExtTpl"), isCustom: false }
  ];

  const domainPreset = defaultPresets.find(p => p.id === 'def_3');
  if (domainPreset && currentTabDomain) {
    domainPreset.regex = '^https?://(?!.*' + currentTabDomain.replace(/\./g, '\\.') + ')(.*)';
  }

  const allPresets = [...defaultPresets, ...customPresets];
  allPresets.forEach(preset => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.innerHTML = preset.name;
    btn.addEventListener('click', () => {
      regexInput.value = preset.regex;
      templateInput.value = preset.template;
      processAndRenderData();
    });

    if (preset.isCustom) {
      const delSpan = document.createElement('span');
      delSpan.className = 'del-btn'; delSpan.innerHTML = '×';
      delSpan.addEventListener('click', (e) => {
        e.stopPropagation(); deleteCustomPreset(preset.id);
      });
      btn.appendChild(delSpan);
    }
    presetContainer.appendChild(btn);
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'preset-btn';
  clearBtn.style.background = '#fee2e2'; clearBtn.style.color = '#dc2626'; clearBtn.style.borderColor = '#fca5a5';
  clearBtn.innerHTML = chrome.i18n.getMessage("presetClear");
  clearBtn.addEventListener('click', () => {
    regexInput.value = ''; templateInput.value = '';
    processAndRenderData();
  });
  presetContainer.appendChild(clearBtn);
}

function saveCustomPreset() {
  const name = document.getElementById('newPresetName').value.trim();
  const regex = document.getElementById('newPresetRegex').value.trim();
  const template = document.getElementById('newPresetTemplate').value.trim();
  if (!name || !regex) return showToast(copyErrorToast, chrome.i18n.getMessage("emptyPresetError"));

  const newPreset = { id: 'cust_' + Date.now(), name, regex, template, isCustom: true };
  let customPresets = JSON.parse(localStorage.getItem('pudiu_custom_presets') || '[]');
  customPresets.push(newPreset);
  localStorage.setItem('pudiu_custom_presets', JSON.stringify(customPresets));
  
  document.getElementById('addPresetForm').style.display = 'none';
  loadAndRenderPresets(); showToast(copySuccessToast, chrome.i18n.getMessage("presetSaved"));
}

function deleteCustomPreset(id) {
  let customPresets = JSON.parse(localStorage.getItem('pudiu_custom_presets') || '[]');
  customPresets = customPresets.filter(p => p.id !== id);
  localStorage.setItem('pudiu_custom_presets', JSON.stringify(customPresets));
  loadAndRenderPresets();
}

// 核心初始化
document.addEventListener('DOMContentLoaded', async () => {
  localizeUI(); // 应用国际化

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  if (!currentTab || !currentTab.url) return showError('No valid page found');
  try { currentTabDomain = new URL(currentTab.url).hostname; } catch (e) {}

  const storageData = await chrome.storage.local.get(['continuousMode', 'globalDataPool']);
  isContinuousMode = storageData.continuousMode || false;
  
  if (isContinuousMode) {
    continuousCb.checked = true;
    clearPoolBtn.style.display = 'flex';
    rawDataPool = storageData.globalDataPool || [];
  }

  loadAndRenderPresets();
  switchMode('web');
  bindEvents();
});

function switchMode(mode) {
  currentMode = mode;
  if (mode === 'web') {
    tabWeb.classList.add('active'); tabText.classList.remove('active');
    textModeCard.style.display = 'none';
    refreshBtn.style.display = 'flex';
    internalFilterWrap.style.display = 'flex';
    extractWebData(); 
  } else {
    tabText.classList.add('active'); tabWeb.classList.remove('active');
    textModeCard.style.display = 'block';
    refreshBtn.style.display = 'none';
    internalFilterWrap.style.display = 'none';
    
    if (!isContinuousMode) rawDataPool = [];
    processAndRenderData();
    loadingStatus.style.display = 'none';
    mainUI.style.display = 'flex';
  }
}

async function extractWebData() {
  loadingStatus.style.display = 'block'; successStatus.style.display = 'none'; mainUI.style.display = 'none';
  try {
    if (currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('edge://')) return showError(chrome.i18n.getMessage("sysPageError"));
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: getPageHyperlinksAndData,
      args: [currentTab.url],
      world: 'MAIN', injectImmediately: true
    });

    let newExtracted = results[0]?.result || [];
    
    if (isContinuousMode) {
      rawDataPool = [...rawDataPool, ...newExtracted];
      await chrome.storage.local.set({ globalDataPool: rawDataPool });
    } else {
      rawDataPool = newExtracted;
    }

    if (rawDataPool.length === 0) return showError(chrome.i18n.getMessage("noDataError"));
    
    loadingStatus.style.display = 'none'; mainUI.style.display = 'flex';
    processAndRenderData();
  } catch (error) { showError(chrome.i18n.getMessage("extractFail") + error.message); }
}

function getPageHyperlinksAndData(baseUrl) {
  const extractedList = [];
  const processAndAdd = (str, isUrl = true) => {
    if (!str || typeof str !== 'string' || str.trim() === '') return;
    let cleanStr = str.trim();
    if (isUrl) {
      const lower = cleanStr.toLowerCase();
      if (lower.startsWith('#') || lower.startsWith('javascript:')) return;
      try {
        if (cleanStr.startsWith('mailto:')) { extractedList.push(cleanStr.replace('mailto:', '')); return; }
        if (cleanStr.startsWith('tel:')) { extractedList.push(cleanStr.replace('tel:', '')); return; }
        let absUrl = cleanStr.startsWith('//') ? new URL(`${window.location.protocol}${cleanStr}`).href : new URL(cleanStr, baseUrl).href;
        absUrl = absUrl.split('#')[0];
        if (absUrl.startsWith('http')) extractedList.push(absUrl);
      } catch (e) {}
    } else { extractedList.push(cleanStr); }
  };

  function traverseDOM(rootNode) {
    if (!rootNode) return;
    if (rootNode.tagName && (rootNode.tagName.toLowerCase() === 'a' || rootNode.tagName.toLowerCase() === 'area')) {
      processAndAdd(rootNode.getAttribute('href'), true);
    }
    if (rootNode.attributes) {
      for (let i = 0; i < rootNode.attributes.length; i++) {
        let val = rootNode.attributes[i].value;
        if (val && (val.includes('http://') || val.includes('https://') || val.includes('http:\\/\\/'))) {
          val = val.replace(/\\\//g, '/');
          const urls = val.match(/(https?:\/\/[^\s"'<>\[\](){}\\]+)/g) || [];
          urls.forEach(u => processAndAdd(u, true));
        }
      }
    }
    let child = rootNode.firstElementChild;
    while (child) {
      traverseDOM(child);
      if (child.shadowRoot) traverseDOM(child.shadowRoot);
      child = child.nextElementSibling;
    }
  }
  traverseDOM(document.body);

  try {
    const text = document.body.innerText || "";
    (text.match(/(https?:\/\/[^\s"'<>\[\]()]+)/g) || []).forEach(u => processAndAdd(u, true));
    (text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g) || []).forEach(e => processAndAdd(e, false));
    (text.match(/(?:1[3-9]\d{9})|(?:0\d{2,3}-\d{7,8})/g) || []).forEach(p => processAndAdd(p, false));
  } catch (e) {}

  return extractedList;
}

function extractTextData() {
  const text = rawTextInput.value.trim();
  if (!text) return showToast(copyErrorToast, chrome.i18n.getMessage("pasteTextReq"));
  
  const patternStr = regexInput.value;
  let newExtracted = [];

  if (patternStr) {
    try {
      const customReg = new RegExp(patternStr, 'gi');
      let match;
      while ((match = customReg.exec(text)) !== null) { newExtracted.push(match[0]); }
    } catch (e) { showToast(copyErrorToast, chrome.i18n.getMessage("regexError")); return;}
  } else {
    const urls = text.match(/(https?:\/\/[^\s"'<>\[\]()]+)/g) || [];
    const emails = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g) || [];
    const phones = text.match(/(?:1[3-9]\d{9})|(?:0\d{2,3}-\d{7,8})/g) || [];
    newExtracted = [...urls, ...emails, ...phones];
  }

  if (isContinuousMode) {
    rawDataPool = [...rawDataPool, ...newExtracted];
    chrome.storage.local.set({ globalDataPool: rawDataPool });
  } else {
    rawDataPool = newExtracted;
  }

  processAndRenderData();
  showToast(copySuccessToast, chrome.i18n.getMessage("extractDone"));
}

function processAndRenderData() {
  if (rawDataPool.length === 0) {
    linksList.innerHTML = '';
    filterEmpty.style.display = 'block';
    successStatus.style.display = 'none';
    chrome.runtime.sendMessage({ action: 'updateBadge', count: 0 }, () => {});
    return;
  }

  let processingData = dedupCb.checked ? [...new Set(rawDataPool)] : [...rawDataPool];

  const includeStr = includeInput.value.trim().toLowerCase();
  const excludeStr = excludeInput.value.trim().toLowerCase();
  const includeKeywords = includeStr.split(/[\s,，;；]+/).filter(Boolean);
  const excludeKeywords = excludeStr.split(/[\s,，;；]+/).filter(Boolean);

  const excludeInternal = excludeInternalCb.checked;
  const patternStr = regexInput.value;
  const templateStr = templateInput.value;
  let customRegex = null;

  if (patternStr) {
    try { customRegex = new RegExp(patternStr, 'i'); } catch (e) {}
  }

  linksList.innerHTML = '';
  let matchCount = 0;

  processingData.forEach(rawData => {
    const lowerStr = rawData.toLowerCase();
    
    let isIncludeMatch = true;
    if (includeKeywords.length > 0) isIncludeMatch = includeKeywords.some(kw => lowerStr.includes(kw));
    let isExcludeMatch = false;
    if (excludeKeywords.length > 0) isExcludeMatch = excludeKeywords.some(kw => lowerStr.includes(kw));

    if (!isIncludeMatch || isExcludeMatch) return;
    
    if (currentMode === 'web' && excludeInternal && currentTabDomain && rawData.startsWith('http')) {
      try {
        const itemDomain = new URL(rawData).hostname;
        if (itemDomain.includes(currentTabDomain) || currentTabDomain.includes(itemDomain)) return;
      } catch (e) {}
    }

    let finalDisplayValue = rawData;
    let isRegexMatched = false;

    if (customRegex) {
      const matchObj = customRegex.exec(rawData);
      if (matchObj) {
        isRegexMatched = true;
        if (templateStr) {
          finalDisplayValue = templateStr.replace(/\{\{(\d+)\}\}/g, (match, p1) => {
            const idx = parseInt(p1, 10);
            return matchObj[idx] !== undefined ? matchObj[idx] : '';
          });
        } else {
           const groups = matchObj.slice(1).filter(Boolean);
           finalDisplayValue = groups.length > 0 ? groups.join(' | ') : matchObj[0];
        }
      } else {
        return; 
      }
    }

    matchCount++;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'link-item';
    
    if (customRegex && isRegexMatched && finalDisplayValue !== rawData) {
      itemDiv.innerHTML = `<span class="processed-result result-value">${escapeHtml(finalDisplayValue)}</span>
                           <a href="javascript:void(0)" class="raw-url" title="Data: ${rawData}">${chrome.i18n.getMessage("originalText")}${escapeHtml(rawData)}</a>`;
    } else {
      const isHttp = rawData.startsWith('http');
      itemDiv.innerHTML = isHttp 
        ? `<a href="${rawData}" target="_blank" class="processed-result result-value" style="font-weight:normal;">${escapeHtml(rawData)}</a>`
        : `<span class="processed-result result-value" style="font-weight:normal;">${escapeHtml(rawData)}</span>`;
    }
    
    linksList.appendChild(itemDiv);
  });

  filterEmpty.style.display = matchCount === 0 ? 'block' : 'none';
  successStatus.style.display = 'block';
  chrome.runtime.sendMessage({ action: 'updateBadge', count: matchCount }, () => {});
  
  const poolPrefix = isContinuousMode ? chrome.i18n.getMessage("poolPrefix") : '';
  if (customRegex) {
      successStatus.innerHTML = poolPrefix + chrome.i18n.getMessage("resultRegex", [matchCount.toString()]);
  } else {
      const dedupMsg = dedupCb.checked ? chrome.i18n.getMessage("dedupedText") : '';
      successStatus.innerHTML = poolPrefix + chrome.i18n.getMessage("resultNormal", [matchCount.toString(), dedupMsg]);
  }
}

function bindEvents() {
  tabWeb.addEventListener('click', () => switchMode('web'));
  tabText.addEventListener('click', () => switchMode('text'));
  
  refreshBtn.addEventListener('click', extractWebData);
  extractTextBtn.addEventListener('click', extractTextData);

  toggleAdvanced.addEventListener('click', () => {
    const isHidden = advancedContent.style.display === 'none';
    advancedContent.style.display = isHidden ? 'block' : 'none';
    document.getElementById('advancedArrow').textContent = isHidden ? '▲' : '▼';
  });

  showAddPresetBtn.addEventListener('click', () => addPresetForm.style.display = addPresetForm.style.display === 'none' ? 'flex' : 'none');
  cancelPresetBtn.addEventListener('click', () => addPresetForm.style.display = 'none');
  savePresetBtn.addEventListener('click', saveCustomPreset);

  includeInput.addEventListener('input', processAndRenderData);
  excludeInput.addEventListener('input', processAndRenderData);
  excludeInternalCb.addEventListener('change', processAndRenderData);
  dedupCb.addEventListener('change', processAndRenderData);
  regexInput.addEventListener('input', processAndRenderData);
  templateInput.addEventListener('input', processAndRenderData);

  continuousCb.addEventListener('change', async (e) => {
    isContinuousMode = e.target.checked;
    await chrome.storage.local.set({ continuousMode: isContinuousMode });
    
    if (isContinuousMode) {
      await chrome.storage.local.set({ globalDataPool: rawDataPool });
      clearPoolBtn.style.display = 'flex';
      showToast(copySuccessToast, chrome.i18n.getMessage("poolOpened"));
    } else {
      await chrome.storage.local.remove('globalDataPool');
      clearPoolBtn.style.display = 'none';
      showToast(copySuccessToast, chrome.i18n.getMessage("poolClosed"));
      if(currentMode === 'web') extractWebData();
    }
    processAndRenderData();
  });

  clearPoolBtn.addEventListener('click', async () => {
    rawDataPool = [];
    await chrome.storage.local.set({ globalDataPool: [] });
    showToast(copySuccessToast, chrome.i18n.getMessage("poolCleared"));
    if(currentMode === 'web') extractWebData();
    else processAndRenderData();
  });

  copyAllBtn.addEventListener('click', () => {
    const visibleVals = Array.from(document.querySelectorAll('.link-item:not(.hidden) .result-value')).map(el => el.textContent.trim());
    if (visibleVals.length === 0) return showToast(copyErrorToast, chrome.i18n.getMessage("copyEmpty"));
    
    navigator.clipboard.writeText(visibleVals.join('\n'))
      .then(() => showToast(copySuccessToast, chrome.i18n.getMessage("copySuccess", [visibleVals.length.toString()])))
      .catch(() => showToast(copyErrorToast, chrome.i18n.getMessage("copyFail")));
  });
}

function showError(msg) {
  loadingStatus.style.display = 'none'; errorStatus.style.display = 'block'; errorStatus.textContent = msg;
}
function escapeHtml(str) { return str ? str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;') : ''; }
function showToast(element, msg) {
  if (msg) element.innerHTML = msg; // 改为 innerHTML 支持带 <span> 的动态字符串
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2000);
}